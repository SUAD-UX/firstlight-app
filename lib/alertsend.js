// ============================================================================
// Firstlight — lib/alertsend.js (server-side glue for the Telegram alerts)
//
// Subscriptions → engine numbers. Shared by the webhook
// (/api/telegram, for /test and the "Send me a test alert now" button) and
// the checker (/api/telegram/cron, for status-change alerts + the Nightly
// Brief). Builds ONE board per distinct size through the same
// buildSessionBoard path as /api/board — verdicts are never recomputed
// here; a failed read yields an honest "no numbers" line, never a guess.
// ============================================================================

import { buildSessionBoard } from "./supabase.js";
import { pickLiveView, tickerRows, tickerStatus, subLine, usd } from "./alerts.js";

/** subs: [{chat_id, ticker, size_usd}] → facts: [{sub, board, row, status}]
 *  plus the view actually used. view === null → pick the live view now. */
export async function boardFacts(subs, { view = null } = {}) {
  const v = view || pickLiveView(new Date());
  const sizes = [...new Set(subs.map((s) => Number(s.size_usd)))];
  const boards = {};
  for (const sz of sizes) {
    try {
      boards[sz] = await buildSessionBoard(sz, { view: v });
    } catch (e) {
      boards[sz] = {
        mode: "error", view: v,
        note: "live read unavailable (" + String((e && e.message) || e).slice(0, 100) + ")",
      };
    }
  }
  const facts = [];
  for (const sub of subs) {
    const board = boards[Number(sub.size_usd)];
    let row = null, status = "NO DATA";
    if (board && board.mode !== "error" && Array.isArray(board.blocks)) {
      row = tickerRows(board).rows.find((r) => r.name === sub.ticker) || null;
      status = row ? tickerStatus(row) : "NO DATA";
    }
    facts.push({ sub, board, row, status });
  }
  return { view: v, facts };
}

/** One text line per subscription — engine numbers, or the honest
 *  "no numbers" line when that size's board read failed. */
export function factLine(f) {
  if (!f.board || f.board.mode === "error") {
    return f.sub.ticker + " at " + usd(f.sub.size_usd) +
      " — live read unavailable, no numbers invented";
  }
  if (!f.row) {
    return f.sub.ticker + " at " + usd(f.sub.size_usd) + " — no data for this name";
  }
  return subLine(f.row, usd(f.sub.size_usd));
}
