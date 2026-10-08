// ============================================================================
// Firstlight — /api/telegram/cron (the alert checker, called by Supabase
// pg_cron every 5 minutes — deliberately NOT Vercel Cron, whose Hobby plan
// allows only once per day)
//
// Every run:
//   1 · status changes — for each subscribed (ticker, size) the overall
//      status is computed from COMPLETED blocks of the live board (weekend
//      while it runs, else the weekday night in progress, else the last
//      completed night). A real TRANSITION into ACTIONABLE or DARK sends a
//      message to every subscriber of that ticker+size — once per event,
//      never per run. First sighting only records the baseline.
//   2 · Nightly Brief — any run inside the 20:00 ET hour sends each chat
//      one brief (last completed night's numbers, one line per
//      subscription), guarded once per ET date in tg_state.
//
// Auth: the shared secret TELEGRAM_CRON_SECRET — as `Authorization: Bearer`
// (what pg_net would send if configured with headers), or in the JSON body
// {"secret": ...} (what the SQL below sends), or ?key=... for a manual
// browser check. The bot token and the secret live ONLY in Vercel env vars.
//
// Text: engine numbers only. With WHY_API_KEY set, the LLM only rephrases
// the evidence (same guardrails as /api/why); without it the deterministic
// template is used. No buy/sell, no direction, ever.
// ============================================================================

import { NextResponse } from "next/server";
import { rest, restMutate } from "../../../../../lib/supabase.js";
import { sendMessage } from "../../../../../lib/telegram.js";
import {
  etClock, pickLiveView, statusChanged, subLine, usd,
  templateAlertText, alertSystemPrompt, briefText,
} from "../../../../../lib/alerts.js";
import { boardFacts, factLine } from "../../../../../lib/alertsend.js";

export const dynamic = "force-dynamic";

function authorized(request, bodySecret) {
  const secret = process.env.TELEGRAM_CRON_SECRET || "";
  if (!secret) {
    return { ok: false, why: "TELEGRAM_CRON_SECRET is not set — add it in Vercel env vars, then Redeploy." };
  }
  const auth = request.headers.get("authorization") || "";
  if (auth === "Bearer " + secret) return { ok: true };
  if (bodySecret && bodySecret === secret) return { ok: true };
  try {
    if (new URL(request.url).searchParams.get("key") === secret) return { ok: true };
  } catch { /* fall through */ }
  return { ok: false, why: "unauthorized" };
}

/** The optional LLM phrasing path — mirrors /api/why: same provider env
 *  vars, same fallback discipline. The LLM may only rephrase evidence. */
async function phraseAlert(ev) {
  const tmpl = templateAlertText(ev);
  const key = process.env.WHY_API_KEY;
  if (!key) return tmpl;
  try {
    const url = process.env.WHY_API_URL ||
      "https://api.openai.com/v1/chat/completions";
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.WHY_MODEL || "gpt-4o-mini",
        temperature: 0,
        max_tokens: 180,
        messages: [
          { role: "system", content: alertSystemPrompt() },
          { role: "user", content: JSON.stringify(ev) },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    const j = await r.json();
    const text = j && j.choices && j.choices[0] && j.choices[0].message &&
      String(j.choices[0].message.content || "").trim();
    if (text) {
      return text.length > 600 ? text.slice(0, 600).trimEnd() + "…" : text;
    }
    return tmpl;
  } catch {
    return tmpl; // the deterministic narrator — never fail an alert
  }
}

async function run() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return { status: 503, body: { ok: false, error: "TELEGRAM_BOT_TOKEN not set" } };
  }

  const { rows: subs } = await rest("tg_subs",
    { select: "chat_id,ticker,size_usd" });
  if (!subs.length) {
    return { status: 200, body: { ok: true, note: "no subscribers yet" } };
  }

  const now = new Date();
  const view = pickLiveView(now);
  const { facts } = await boardFacts(subs, { view });

  const { rows: stateRows } = await rest("tg_state", { select: "key,value" });
  const state = Object.fromEntries(stateRows.map((r) => [r.key, r.value]));

  // 1 · status-change alerts (one per (ticker,size) event, not per run)
  const alerts = [];
  const newStates = [];
  const seen = new Set();
  for (const f of facts) {
    const key = f.sub.ticker + "|" + f.sub.size_usd;
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = state[key] != null ? state[key] : null;
    if (statusChanged(prev, f.status)) alerts.push({ f, prev });
    if (prev !== f.status) newStates.push({ key, value: f.status });
  }

  // 2 · Nightly Brief — first run inside the 20:00 ET hour, once per date
  const et = etClock(now);
  let briefSent = 0;
  if (et.hour === 20) {
    const bkey = "brief|" + et.dateStr;
    if (state[bkey] !== "sent") {
      const { facts: briefFacts } = await boardFacts(subs, { view: "last_night" });
      const byChat = new Map();
      for (const f of briefFacts) {
        if (!byChat.has(f.sub.chat_id)) byChat.set(f.sub.chat_id, []);
        byChat.get(f.sub.chat_id).push(factLine(f));
      }
      const meta = briefFacts[0] && briefFacts[0].board;
      for (const [chat, lines] of byChat) {
        const r = await sendMessage(token, chat, briefText(lines, {
          sessionLabel: (meta && meta.session && meta.session.label) || "",
          view: "last_night",
        }));
        if (r && r.ok) briefSent++;
      }
      newStates.push({ key: bkey, value: "sent" });
    }
  }

  // 3 · send the change alerts
  let alertsSent = 0;
  for (const { f, prev } of alerts) {
    const ev = {
      ticker: f.sub.ticker,
      sizeLabel: usd(f.sub.size_usd),
      from: prev,
      to: f.status,
      sessionLabel: (f.board && f.board.session && f.board.session.label) || "",
      view,
      row: f.row || { a: 0, complete: 0, nPerp: 0 },
    };
    const text = await phraseAlert(ev);
    const r = await sendMessage(token, f.sub.chat_id, text);
    if (r && r.ok) alertsSent++;
  }

  // 4 · persist states AFTER the sends (a failed send retries next run)
  for (const s of newStates) {
    try { await restMutate("POST", "tg_state", s); } catch { /* retried next run */ }
  }

  return { status: 200, body: {
    ok: true, view, subs: subs.length, alertsSent, briefSent,
  } };
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const a = authorized(request, body && body.secret);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.why }, { status: 401 });
  const r = await run();
  return NextResponse.json(r.body, { status: r.status });
}

export async function GET(request) {
  const a = authorized(request, null);
  if (!a.ok) return NextResponse.json({ ok: false, error: a.why }, { status: 401 });
  const r = await run();
  return NextResponse.json(r.body, { status: r.status });
}
