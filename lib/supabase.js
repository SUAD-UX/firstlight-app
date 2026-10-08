// ============================================================================
// Firstlight — Supabase read adapter (server-side only).
// Reads the Phase 0 recorder's tables via PostgREST with the service-role key
// (kept in Vercel env vars — NEVER in client code) and feeds the engine.
//
// The board is a REAL product: every square comes from the recorder via the
// engine. There is no demo data and no demo fallback anywhere.
//
//   view "last_night" (default) — most recent COMPLETED weekday night
//        (Mon–Thu 20:00 → next day 04:00 ET), 8 hourly blocks.
//   view "weekend" — the current weekend while it runs (blocks fill in with
//        real recordings as they arrive), else the most recent completed one;
//        8 blocks × 7 wall hours from Fri 20:00 ET.
//
// Each block is evaluated by the engine AS OF that block:
//   books   — nearest non-pruned book per (name, market) within the
//             pre-registered ±120 s of the block's eval instant
//   fills   — the tape up to the eval instant (36 h lookback, newest-first
//             query so truncation can never hide the recent tape)
//   coverage— snapshots per (name, market) inside the block; the engine turns
//             fewer than 30 into NO DATA and estimates nothing
//   stamp   — "recorded N h ago" = age of the newest snapshot row (heartbeat)
//
// All session math is ET wall-clock (America/New_York), DST-aware, and uses
// the Python-weekday convention (Mon=0 … Sun=6) exactly like engine.js.
// ============================================================================

import {
  NAMES, levels, buildBoard, sessionAndBlock,
  THRESHOLDS, TAKER_FEE_BP, WEEKDAY_BOUNDS, WEEKEND_BOUNDS,
} from "./engine.js";

function env() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error("missing env: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY " +
      "(Vercel → Project → Settings → Environment Variables)");
  }
  return { url, key };
}

export async function rest(path, params) {
  const { url, key } = env();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}/rest/v1/${path}?${qs}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    // no caching on Vercel — boards must be fresh
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`supabase ${path} -> HTTP ${res.status}`);
  }
  return { rows: await res.json() };
}

/** PostgREST write with the service-role key — used ONLY by the Telegram
 *  alert stores (tg_subs / tg_state: service-role only, RLS on, no policies).
 *  POST = upsert (Prefer: resolution=merge-duplicates); DELETE takes
 *  eq-filters in `params`. Returns true or throws — never invents rows. */
export async function restMutate(method, path, body, params) {
  const { url, key } = env();
  const qs = new URLSearchParams(params || {}).toString();
  const res = await fetch(`${url}/rest/v1/${path}${qs ? "?" + qs : ""}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal" +
        (method === "POST" ? ",resolution=merge-duplicates" : ""),
    },
    cache: "no-store",
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`supabase ${path} ${method} -> HTTP ${res.status}`);
  }
  return true;
}

const isoUtc = (date) => date.toISOString();

// ---------------------------------------------------------------------------
// ET wall-clock helpers (same convention as engine.js: Mon=0 … Sun=6)
// ---------------------------------------------------------------------------

const etPartsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  weekday: "short",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function etWallFull(date) {
  const parts = etPartsFmt.formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return {
    dow: DOW[g("weekday")] ?? -1,
    year: Number(g("year")), month: Number(g("month")), day: Number(g("day")),
    hour: (Number(g("hour"))) % 24, minute: Number(g("minute")),
  };
}

/** ET wall-clock -> UTC instant (fold=0, one-iteration offset; exact except
 *  inside the once-a-year ambiguous fall-back hour — fine for block bounds). */
function etWallToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const wall = etWallFull(new Date(guess));
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return new Date(guess - (asUtc - guess));
}

const MS_MIN = 60_000, MS_HOUR = 3_600_000, MS_DAY = 86_400_000;
const NIGHT_DOW_NAMES = ["Mon", "Tue", "Wed", "Thu"];   // weekday-night starts
const DAY_AFTER_NAMES = ["Tue", "Wed", "Thu", "Fri"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const calOf = (utcMs) => {
  const d = new Date(utcMs);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate() };
};
const calLabel = (utcMs) => {
  const c = calOf(utcMs);
  return `${MONTHS[c.mo - 1]} ${c.d}`;
};
/** Python-weekday (Mon=0) of a pure calendar date. */
const calDow = (utcMs) => (new Date(utcMs).getUTCDay() + 6) % 7;

// ---------------------------------------------------------------------------
// blockStart — kept as a pure utility (current block only; diagnostics)
// ---------------------------------------------------------------------------

export async function blockStart(now = new Date()) {
  const { session, block_id, block_label } = sessionAndBlock(now);
  if (session === "off_window" || !block_id) {
    return { start: null, session, blockId: block_id, blockLabel: block_label };
  }
  const w = etWallFull(now);
  const h = w.hour + w.minute / 60;
  let anchorMs, totalH;
  if (session === "weekend") {
    const back = w.dow === 4 ? 0 : ((w.dow - 4) + 7) % 7;   // Fri0 Sat1 Sun2 Mon3
    const idx = Number(block_id.split("b")[1]);
    anchorMs = Date.UTC(w.year, w.month - 1, w.day) - back * MS_DAY;
    totalH = 20 + idx * 7;                                  // wall hours from Fri 00:00
  } else {
    const nightDow = h >= 20 ? w.dow : ((w.dow - 1) + 7) % 7;
    const idx = Number(block_id.split("h")[1]);
    const back = ((w.dow - nightDow) + 7) % 7;
    anchorMs = Date.UTC(w.year, w.month - 1, w.day) - back * MS_DAY;
    totalH = 20 + idx;
  }
  const dayMs = anchorMs + Math.floor(totalH / 24) * MS_DAY;
  const c = calOf(dayMs);
  const start = etWallToUtc(c.y, c.mo, c.d, totalH % 24, 0);
  return { start, session, blockId: block_id, blockLabel: block_label };
}

// ---------------------------------------------------------------------------
// resolveSession — pure ET math: which session does a view refer to?
// ---------------------------------------------------------------------------

function weekdayNightSession(startDayUtcMs) {
  const dowIdx = calDow(startDayUtcMs);
  const a = calOf(startDayUtcMs);
  const e = calOf(startDayUtcMs + MS_DAY);
  const blocks = [];
  for (let i = 0; i < 8; i++) {
    const h0 = 20 + i, h1 = 20 + i + 1;
    const c0 = calOf(startDayUtcMs + Math.floor(h0 / 24) * MS_DAY);
    const c1 = calOf(startDayUtcMs + Math.floor(h1 / 24) * MS_DAY);
    blocks.push({
      id: `wd-${NIGHT_DOW_NAMES[dowIdx].toLowerCase()}-h${i}`,
      label: `${i < 4 ? NIGHT_DOW_NAMES[dowIdx] : DAY_AFTER_NAMES[dowIdx]} ` +
        `${WEEKDAY_BOUNDS[i]}–${WEEKDAY_BOUNDS[i + 1]} ET`,
      startUtc: etWallToUtc(c0.y, c0.mo, c0.d, h0 % 24, 0),
      endUtc: etWallToUtc(c1.y, c1.mo, c1.d, h1 % 24, 0),
    });
  }
  return {
    kind: "weekday_night",
    label: `${NIGHT_DOW_NAMES[dowIdx]} ${calLabel(startDayUtcMs)} 20:00 → ` +
      `${DAY_AFTER_NAMES[dowIdx]} ${calLabel(startDayUtcMs + MS_DAY)} 04:00 ET`,
    startUtc: etWallToUtc(a.y, a.mo, a.d, 20, 0),
    endUtc: etWallToUtc(e.y, e.mo, e.d, 4, 0),
    blocks,
  };
}

function weekendSession(friUtcMs) {
  const a = calOf(friUtcMs);
  const m = calOf(friUtcMs + 3 * MS_DAY);   // Monday after that Friday
  const blocks = [];
  for (let i = 0; i < 8; i++) {
    const h0 = 20 + i * 7, h1 = 20 + (i + 1) * 7;
    const c0 = calOf(friUtcMs + Math.floor(h0 / 24) * MS_DAY);
    const c1 = calOf(friUtcMs + Math.floor(h1 / 24) * MS_DAY);
    blocks.push({
      id: `we-b${i}`,
      label: `${WEEKEND_BOUNDS[i][0]} ${WEEKEND_BOUNDS[i][1]}–` +
        `${WEEKEND_BOUNDS[i + 1][0]} ${WEEKEND_BOUNDS[i + 1][1]} ET`,
      startUtc: etWallToUtc(c0.y, c0.mo, c0.d, h0 % 24, 0),
      endUtc: etWallToUtc(c1.y, c1.mo, c1.d, h1 % 24, 0),
    });
  }
  return {
    kind: "weekend",
    label: `Fri ${calLabel(friUtcMs)} 20:00 → Mon ${calLabel(friUtcMs + 3 * MS_DAY)} 04:00 ET`,
    startUtc: etWallToUtc(a.y, a.mo, a.d, 20, 0),
    endUtc: etWallToUtc(...(() => {
      const m = calOf(friUtcMs + 3 * MS_DAY);
      return [m.y, m.mo, m.d];
    })(), 4, 0),
    blocks,
  };
}

/** view "last_night": most recent COMPLETED Mon–Thu night (a night in
 *  progress does not count — Friday 20:00 belongs to the weekend session).
 *  view "weekend": the weekend session in progress, else the most recent
 *  completed one. Completed blocks evaluate at end − 60 s; the in-progress
 *  block evaluates at now; future blocks have evalUtc null (NO DATA).
 *  view "tonight" (alerts only): the weekday night currently running —
 *  blocks fill in as their hours complete, exactly like the weekend view.
 *  Off window (weekday daytime, Fri night, Mon early AM — those belong to
 *  the weekend session) it degrades to the completed last_night board. */
export function resolveSession(view, now = new Date()) {
  view = view === "weekend" || view === "tonight" ? view : "last_night";
  const w = etWallFull(now);
  const nowMin = w.hour * 60 + w.minute;
  const todayUtc = Date.UTC(w.year, w.month - 1, w.day);
  let s = null;

  if (view === "tonight") {
    let startDayUtc = null;
    if (w.dow <= 3 && nowMin >= 1200) startDayUtc = todayUtc;            // Mon–Thu ≥ 20:00
    else if (w.dow >= 1 && w.dow <= 4 && nowMin < 240) {                 // Tue–Fri < 04:00
      startDayUtc = todayUtc - MS_DAY;
    }
    if (startDayUtc != null) s = weekdayNightSession(startDayUtc);
    else view = "last_night";                                            // off window
  }
  if (view === "last_night") {
    for (let k = 1; k <= 10; k++) {
      const dayUtc = todayUtc - k * MS_DAY;                 // night start day
      if (((w.dow - k) % 7 + 7) % 7 > 3) continue;          // Mon–Thu only
      const completed = k > 1 || nowMin >= 240;             // ended (D+1) 04:00 ET
      if (!completed) continue;
      s = weekdayNightSession(dayUtc);
      break;
    }
    if (!s) s = weekdayNightSession(todayUtc - 8 * MS_DAY); // unreachable in practice
  } else if (view === "weekend") {
    for (let k = 0; k <= 13; k++) {
      const friUtc = todayUtc - k * MS_DAY;
      if (((w.dow - k) % 7 + 7) % 7 !== 4) continue;        // Fridays only
      const cand = weekendSession(friUtc);
      if (now >= cand.startUtc) { s = cand; break; }        // running or completed
    }
    if (!s) s = weekendSession(todayUtc - 7 * MS_DAY);
  }

  s.view = view;
  s.inProgress = now < s.endUtc;
  s.blocks = s.blocks.map((b) => {
    const complete = b.endUtc <= now;
    return {
      ...b,
      complete,
      evalUtc: complete
        ? new Date(b.endUtc.getTime() - MS_MIN)
        : (now >= b.startUtc ? new Date(now.getTime()) : null),
    };
  });
  return s;
}

// ---------------------------------------------------------------------------
// loaders (per pair in parallel — ~31 small PostgREST queries per board)
// ---------------------------------------------------------------------------

/** Nearest non-pruned book per (name, market, block) within ±120 s of the
 *  block's eval instant. One or-of-windows query per pair. */
export async function loadBooksForBlocks(session) {
  const idxs = session.blocks.map((b, i) => (b.evalUtc ? i : -1)).filter((i) => i >= 0);
  const byBlock = {};
  for (const i of idxs) byBlock[i] = {};

  await Promise.all(NAMES.flatMap((name) => ["spot", "perp"].map(async (market) => {
    const ors = idxs.map((i) => {
      const ev = session.blocks[i].evalUtc.getTime();
      return `and(minute_ts.gte.${isoUtc(new Date(ev - 2 * MS_MIN))},` +
        `minute_ts.lte.${isoUtc(new Date(ev + 2 * MS_MIN))})`;
    }).join(",");
    const { rows } = await rest("book_depth", {
      select: "ts,bids,asks",
      name: `eq.${name}`, market: `eq.${market}`,
      or: `(${ors})`,
      order: "minute_ts.desc", limit: "48",
    });
    const usable = rows.filter((r) =>
      Array.isArray(r.bids) && r.bids.length > 0 &&
      Array.isArray(r.asks) && r.asks.length > 0);
    for (const i of idxs) {
      const ev = session.blocks[i].evalUtc.getTime();
      let best = null, bestD = Infinity;
      for (const r of usable) {
        const d = Math.abs(Date.parse(r.ts) - ev);
        if (d <= THRESHOLDS.max_book_age_s * 1000 && d < bestD) { best = r; bestD = d; }
      }
      if (!best) continue; // no book within the ±120 s rule -> NO DATA for this leg
      byBlock[i][name] = byBlock[i][name] || { fetchedMs: 0, spot: null, perp: null };
      byBlock[i][name][market] = {
        market, ts_ms: Date.parse(best.ts),
        bids: levels(best.bids, "bids"), asks: levels(best.asks, "asks"),
      };
      byBlock[i][name].fetchedMs = Math.max(byBlock[i][name].fetchedMs, byBlock[i][name][market].ts_ms);
    }
  })));

  // the engine's cell needs both legs — otherwise the name becomes NO DATA
  for (const i of idxs) {
    for (const name of NAMES) {
      const e = byBlock[i][name];
      if (e && !(e.spot && e.perp)) delete byBlock[i][name];
    }
  }
  return byBlock;
}

/** Fills tape in [until − 36 h, until], newest-first query (limit can never
 *  hide the recent tape), reversed to ascending for the engine's bisect. */
export async function loadFillsUntil(untilMs, hours = 36) {
  const since = isoUtc(new Date(untilMs - hours * MS_HOUR));
  const until = isoUtc(new Date(untilMs));
  const fills = {};
  await Promise.all(NAMES.flatMap((name) => ["spot", "perp"].map(async (market) => {
    const { rows } = await rest("fills", {
      select: "ts",
      name: `eq.${name}`, market: `eq.${market}`,
      and: `(ts.gte.${since},ts.lte.${until})`,
      order: "ts.desc", limit: "10000",
    });
    fills[`${name}:${market}`] = { ts: rows.map((r) => Date.parse(r.ts)).reverse() };
  })));
  return fills;
}

/** Per-block perp OHLC + minute closes for the board squares, aggregated
 *  from the recorder's 1-minute candles (candles_1m). One ascending query
 *  per name. Real recorded prices only — null where the recorder has none.
 *  closes is the block's per-minute close series, evenly downsampled to at
 *  most 60 points (a weekday block is 60 minutes; a weekend block up to 480). */
export async function loadCandlesForSession(session) {
  const since = isoUtc(session.startUtc);
  const until = isoUtc(session.endUtc);
  const out = {};
  await Promise.all(NAMES.map(async (name) => {
    const { rows } = await rest("candles_1m", {
      select: "ts,o,h,l,c",
      name: `eq.${name}`, market: `eq.perp`,
      and: `(ts.gte.${since},ts.lt.${until})`,
      order: "ts.asc", limit: "1000",
    });
    const per = new Array(8).fill(null);
    for (const r of rows) {
      const t = Date.parse(r.ts);
      for (let i = 0; i < 8; i++) {
        const b = session.blocks[i];
        if (t >= b.startUtc.getTime() && t < b.endUtc.getTime()) {
          if (!per[i]) per[i] = { o: +r.o, h: +r.h, l: +r.l, c: +r.c, n: 1, closes: [] };
          else {
            per[i].h = Math.max(per[i].h, +r.h);
            per[i].l = Math.min(per[i].l, +r.l);
            per[i].c = +r.c;
            per[i].n++;
          }
          per[i].closes.push(+r.c);
          break;
        }
      }
    }
    for (const p of per) if (p) p.closes = downsample(p.closes, 60);
    out[name] = per;
  }));
  return out;
}

/** keep the first and last value, thin the middle evenly to at most max pts */
export function downsample(xs, max) {
  if (xs.length <= max) return xs.slice();
  const out = [xs[0]];
  const step = (xs.length - 1) / (max - 1);
  for (let i = 1; i < max - 1; i++) out.push(xs[Math.round(i * step)]);
  out.push(xs[xs.length - 1]);
  return out;
}

/** Snapshot counts per (name, block) = min over markets. Rows are tiny
 *  (minute_ts only); bucketed client-side into the 8 blocks. */
export async function loadCoverageRows(session) {
  const since = isoUtc(session.startUtc);
  const until = isoUtc(session.endUtc);
  const perMarket = {};
  await Promise.all(NAMES.flatMap((name) => ["spot", "perp"].map(async (market) => {
    const { rows } = await rest("snapshots", {
      select: "minute_ts",
      name: `eq.${name}`, market: `eq.${market}`,
      and: `(minute_ts.gte.${since},minute_ts.lte.${until})`,
      order: "minute_ts.asc", limit: "5000",
    });
    const per = new Array(8).fill(0);
    for (const r of rows) {
      const t = Date.parse(r.minute_ts);
      for (let i = 0; i < 8; i++) {
        const b = session.blocks[i];
        if (t >= b.startUtc.getTime() && t < b.endUtc.getTime()) { per[i]++; break; }
      }
    }
    perMarket[`${name}:${market}`] = per;
  })));
  const counts = {};
  for (const name of NAMES) {
    counts[name] = Array.from({ length: 8 }, (_, i) =>
      Math.min(perMarket[`${name}:spot`][i], perMarket[`${name}:perp`][i]));
  }
  return counts;
}

/** "recorded N h ago" — age of the newest snapshot row (recorder heartbeat). */
export async function loadRecordedStamp(now = new Date()) {
  const { rows } = await rest("snapshots", {
    select: "minute_ts", order: "minute_ts.desc", limit: "1",
  });
  if (!rows.length) return null;
  const ts = Date.parse(rows[0].minute_ts);
  return { ts_utc: isoUtc(new Date(ts)), age_min: Math.max(0, (now.getTime() - ts) / 60000) };
}

// ---------------------------------------------------------------------------
// board assembly
// ---------------------------------------------------------------------------

/** A NO DATA cell for names the engine could not evaluate (missing book or
 *  thin coverage) — same shape as an engine cell so the UI treats them alike. */
export function noDataCell(name, reasons, coverageN = 0) {
  return {
    name, state: "NO DATA", reasons,
    perp: { observed: false, n_books: 0 },
    spot: { observed: false, n_books: 0 },
    freshness: {
      spot: { observed: false, n_fills: 0 },
      perp: { observed: false, n_fills: 0 },
    },
    coverage: {
      n: coverageN, required: THRESHOLDS.min_snapshots_per_block,
      ok: false, waived: false,
    },
    labels: "no recorder data for this block",
  };
}

/** Real board from recorder data (no demo path exists).
 *  Throws only when the live read itself fails (env, network, Supabase). */
export async function buildSessionBoard(sizeUsd, { view = "last_night", now = new Date() } = {}) {
  const session = resolveSession(view, now);
  const evalIdxs = session.blocks
    .map((b, i) => (b.evalUtc ? i : -1)).filter((i) => i >= 0);

  let booksByBlock = {}, fills = {}, coverage = {}, recorded = null, candles = {};
  if (evalIdxs.length) {
    const lastEvalMs = Math.max(...evalIdxs.map((i) => session.blocks[i].evalUtc.getTime()));
    [booksByBlock, fills, coverage, recorded, candles] = await Promise.all([
      loadBooksForBlocks(session),
      loadFillsUntil(lastEvalMs),
      loadCoverageRows(session),
      loadRecordedStamp(now),
      loadCandlesForSession(session),
    ]);
  } else {
    recorded = await loadRecordedStamp(now);
  }

  // Fills per (name, block) for the activity bars — counted from the same
  // tape the engine reads. A pair whose page is full (1,000 newest prints —
  // the PostgREST page cap) may under-count older hours: flagged per name so
  // the UI can mark it honestly instead of showing a false zero.
  const tapeCapped = {};
  const fillsCounts = {};
  for (const name of NAMES) {
    tapeCapped[name] = {};
    fillsCounts[name] = {};
    for (const market of ["spot", "perp"]) {
      const arr = (fills[`${name}:${market}`] && fills[`${name}:${market}`].ts) || [];
      tapeCapped[name][market] = arr.length >= 1000;
      const per = new Array(8).fill(0);
      for (const t of arr) {
        for (let i = 0; i < 8; i++) {
          const b = session.blocks[i];
          if (t >= b.startUtc.getTime() && t < b.endUtc.getTime()) { per[i]++; break; }
        }
      }
      fillsCounts[name][market] = per;
    }
  }
  const fillsFor = (i) => Object.fromEntries(
    NAMES.map((n) => [n, { spot: fillsCounts[n].spot[i], perp: fillsCounts[n].perp[i] }]));
  const pxFor = (i, n) => (candles[n] && candles[n][i]) ? candles[n][i].c : null;
  const closesFor = (i, n) => (candles[n] && candles[n][i]) ? candles[n][i].closes : null;
  const withCandles = (cell, i, n) => ({
    ...cell, px: pxFor(i, n), closes: closesFor(i, n) });

  const blocks = session.blocks.map((b, i) => {
    const base = {
      block_id: b.id, block_label: b.label,
      start_utc: isoUtc(b.startUtc), end_utc: isoUtc(b.endUtc),
      eval_utc: b.evalUtc ? isoUtc(b.evalUtc) : null,
      complete: b.complete,
      fills: fillsFor(i),
    };
    const covN = (n) => coverage[n]?.[i] ?? 0;

    // future / not-yet-started block (weekend view while it runs)
    if (!b.evalUtc) {
      return {
        ...base,
        cells: NAMES.map((n) => withCandles(noDataCell(n,
          [`coverage_${covN(n)}<${THRESHOLDS.min_snapshots_per_block}`], covN(n)), i, n)),
      };
    }

    const coverageCounts = Object.fromEntries(NAMES.map((n) => [n, covN(n)]));
    let engineCells = [];
    try {
      const board = buildBoard(booksByBlock[i] ?? {}, fills, sizeUsd, "live",
        { coverageCounts, evalDate: b.evalUtc });
      engineCells = board.cells;
    } catch (e) {
      // eval instants are inside blocks by construction; anything else is ours
      if (!String(e?.message || e).startsWith("off_window")) throw e;
    }

    // names without books (or a dropped leg) still render as NO DATA cells
    const byName = new Map(engineCells.map((c) => [c.name, c]));
    const cells = NAMES.map((n) => withCandles(byName.get(n) ?? noDataCell(n,
      covN(n) < THRESHOLDS.min_snapshots_per_block
        ? [`coverage_${covN(n)}<${THRESHOLDS.min_snapshots_per_block}`]
        : ["no_book_within_120s_of_eval"],
      covN(n)), i, n));
    return { ...base, cells };
  });

  return {
    schema_version: "1.4.0",
    mode: "live",
    view: session.view,
    kind: session.kind,
    size_usd: sizeUsd,
    size_label: "$" + sizeUsd.toLocaleString("en-US"),
    session: {
      label: session.label,
      start_utc: isoUtc(session.startUtc),
      end_utc: isoUtc(session.endUtc),
      in_progress: session.inProgress,
    },
    recorded,
    names: [...NAMES],
    blocks,
    tape_capped: tapeCapped,
    thresholds: { ...THRESHOLDS },
    fees_rt_bp: { spot: 2 * TAKER_FEE_BP.spot, perp: 2 * TAKER_FEE_BP.perp },
    generated_utc: new Date().toISOString(),
    disclaimer: "Overnight execution evidence only — costs, depth and tape " +
      "freshness at your size. Not a prediction, not advice.",
  };
}
