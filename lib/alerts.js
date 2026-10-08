// ============================================================================
// Firstlight — lib/alerts.js (Part E: the real Telegram alerts)
//
// PURE functions only — no fetch, no env reads, no clock access at import
// time. The routes (app/api/telegram/*) own all IO. Verdicts are NEVER
// recomputed here: everything reads the board that lib/supabase already
// built for /api/board (same engine, same thresholds). Numbers are observed
// values only, with their n — the same rule as the hero numbers.
//
// Status used for alerting counts COMPLETED blocks only, so a half-finished
// hour can never flap an alert; an hour's verdict is fixed once the hour
// closes.
// ============================================================================

import { NAMES, sessionAndBlock } from "./engine.js";

export const ALERT_FOOTER = "observed, never estimated · not advice";

export function usd(n) {
  return "$" + Number(n).toLocaleString("en-US");
}

// ── clock (ET wall time, DST-safe) ────────────────────────────────────────
export function etClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", year: "numeric",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const o = {};
  for (const p of parts) o[p.type] = p.value;
  const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dow: DOW[o.weekday],
    hour: Number(o.hour) % 24,
    minute: Number(o.minute),
    dateStr: o.year + "-" + o.month + "-" + o.day,
  };
}

/** Which live board the alert checker should read right now: the weekend
 *  session while it runs, else the weekday night in progress ("tonight"),
 *  else the most recent completed night. Mirrors the engine's own session
 *  math (sessionAndBlock) — never a new rule. */
export function pickLiveView(now = new Date()) {
  try {
    const s = sessionAndBlock(now).session;
    if (s === "weekend") return "weekend";
    if (s === "weekday_overnight") return "tonight";
  } catch { /* fall through to the completed board */ }
  return "last_night";
}

// ── math + formatting (same as the site) ─────────────────────────────────
export function median(xs) {
  if (!xs || !xs.length) return null;
  const v = xs.slice().sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function fmtAge(min) {
  if (min == null) return "—";
  if (min < 60) return Math.round(min) + " min";
  if (min < 1440) return (min / 60).toFixed(1) + " h";
  return (min / 1440).toFixed(1) + " d";
}

// ── per-ticker rows from a board (COMPLETED blocks only) ────────────────
export function tickerRows(board) {
  const names = Array.isArray(board && board.names) ? board.names.slice() : [];
  const blocks = ((board && board.blocks) || []).filter((b) => b.complete);
  const per = {};
  for (const n of names) per[n] = { a: 0, t: 0, d: 0, n: 0, perp: [] };
  for (const b of blocks) {
    for (const c of b.cells || []) {
      const s = per[c.name];
      if (!s) continue;
      if (c.state === "ACTIONABLE") s.a++;
      else if (c.state === "THIN") s.t++;
      else if (c.state === "DARK") s.d++;
      else s.n++;
      if (c.perp && c.perp.observed && c.perp.rt_bp != null) s.perp.push(c.perp.rt_bp);
    }
  }
  return {
    completedBlocks: blocks.length,
    rows: names.map((n) => {
      const s = per[n];
      return { name: n, a: s.a, t: s.t, d: s.d, n: s.n,
               complete: blocks.length, perpMed: median(s.perp), nPerp: s.perp.length };
    }),
  };
}

/** Overall alert status for one ticker — from its completed blocks.
 *  Order matters: any ACTIONABLE block makes the night ACTIONABLE; all-dark
 *  is DARK; all-no-data is NO DATA; anything else is THIN. */
export function tickerStatus(row) {
  if (!row || !row.complete) return "NO DATA";
  if (row.a > 0) return "ACTIONABLE";
  if (row.d === row.complete) return "DARK";
  if (row.n === row.complete) return "NO DATA";
  return "THIN";
}

/** Alert only on a real TRANSITION into ACTIONABLE or DARK. First sighting
 *  (prev == null) just records the baseline — no welcome spam. */
export function statusChanged(prev, next) {
  return prev != null && next !== prev &&
    (next === "ACTIONABLE" || next === "DARK");
}

/** One subscription's line, engine numbers only. */
export function subLine(row, sizeLabel) {
  const st = tickerStatus(row);
  const cost = row.nPerp > 0
    ? "perp all-in median " + row.perpMed.toFixed(1) + " bp (n " + row.nPerp + ")"
    : "no observed books";
  return row.name + " at " + sizeLabel + " · " + st + " · " +
    row.a + "/" + row.complete + " blocks actionable · " + cost;
}

// ── bot commands (deep-link payloads from the site's bell menu) ──────────
// t.me/<bot>?start=NVDA_1000 arrives at the webhook as "/start NVDA_1000".
export function parseStartPayload(text) {
  const m = /^\/start\s+([A-Za-z]+)[_-](\d{1,6})\s*$/.exec(String(text || "").trim());
  if (!m) return null;
  const ticker = NAMES.find((n) => n === m[1].toUpperCase());
  const size = parseInt(m[2], 10);
  if (!ticker || size < 100 || size > 100000) return null;
  return { ticker, sizeUsd: size };
}

export function parseStopPayload(text) {
  const t = String(text || "").trim();
  if (!/^\/stop(\s|$)/.test(t)) return null;
  const m = /^\/stop\s+([A-Za-z]+)[_-](\d{1,6})\s*$/.exec(t);
  if (!m) return { all: true };
  const ticker = NAMES.find((n) => n === m[1].toUpperCase());
  const size = parseInt(m[2], 10);
  if (!ticker || size < 100 || size > 100000) return { all: true };
  return { ticker, sizeUsd: size };
}

// ── message texts (deterministic narrator) ───────────────────────────────
/** The change alert. ev: {ticker, sizeLabel, from, to, row, sessionLabel,
 *  view} — every number comes from the row the engine produced. */
export function templateAlertText(ev) {
  const row = ev.row || { a: 0, complete: 0, nPerp: 0 };
  const cost = row.nPerp > 0
    ? "perp all-in median " + row.perpMed.toFixed(1) + " bp (n " + row.nPerp + ")"
    : "no observed books";
  return [
    "Firstlight — " + ev.ticker + " turned " + ev.to,
    [ev.sessionLabel, ev.sizeLabel, "view: " + ev.view].filter(Boolean).join(" · "),
    "",
    row.complete > 0
      ? row.a + "/" + row.complete + " completed blocks actionable · " + cost
      : "no completed blocks yet",
    "",
    "Observed, never estimated. Information only — not advice.",
    "https://firstlight-app.vercel.app",
  ].filter(Boolean).join("\n");
}

/** System prompt for the OPTIONAL LLM phrasing path — the LLM only rephrases
 *  the engine's evidence; it may not add, remove or round any number. */
export function alertSystemPrompt() {
  return "You write short Telegram alerts for Firstlight, an overnight " +
    "execution-cost board. You are given a JSON evidence object produced by " +
    "a deterministic engine. Rules: use ONLY the numbers in the evidence — " +
    "never invent, add, or re-round a number; no buy, sell, hold, long, " +
    "short or any direction language — costs and observations only; no " +
    "predictions, no promises, no advice; 1 to 3 plain sentences; if a " +
    "value is missing, say no data. The engine decides; you only phrase it.";
}

/** Nightly Brief — one message per chat, one line per subscription. */
export function briefText(lines, meta) {
  return [
    "Firstlight — Nightly Brief",
    meta && meta.sessionLabel
      ? meta.sessionLabel + " · view: " + (meta.view || "last_night")
      : "",
    "",
    ...lines,
    "",
    "/stop unsubscribes · " + ALERT_FOOTER,
    "https://firstlight-app.vercel.app",
  ].filter(Boolean).join("\n");
}

/** Test alert — proves the pipe with real engine numbers. */
export function testAlertText(lines) {
  return [
    "Firstlight — test alert · live engine numbers",
    "",
    ...lines,
    "",
    "This is exactly what alerts look like. " + ALERT_FOOTER + ".",
  ].join("\n");
}
