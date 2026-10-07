// ============================================================================
// Firstlight engine — JavaScript port of firstlight/phase1/engine.py.
//
// MUST produce identical boards to the Python reference implementation;
// verified by test/run_tests.mjs against the Phase -1 fixture and the
// expected demo board (phase1/results/demo_board_1k.json).
//
// Verdicts are EXECUTION QUALITY ONLY: all-in round-trip cost at a size,
// book depth, spot-tape freshness, per venue. Never direction, never advice.
// Thresholds are the pre-registration in FINDINGS.md §11 (fixed 2026-10-04,
// before any recorder data existed) — never tuned. A null result is valid.
// ============================================================================

export const NAMES = ["NVDA", "TSLA", "AAPL", "MSFT", "SPY"];
export const TAKER_FEE_BP = { spot: 10.0, perp: 6.0 }; // per side, observed default tier
export const THRESHOLDS = {
  perp_rt_max_bp: 15.0,        // DARK if perp all-in RT cost exceeds this
  spot_rt_max_bp: 35.0,        // THIN if spot all-in RT cost exceeds this
  spot_fresh_max_min: 30.0,    // ACTIONABLE requires spot tape this fresh
  perp_fresh_max_min: 10.0,    // DARK if perp tape staler (observed only)
  min_snapshots_per_block: 30, // NO DATA below this coverage
  max_book_age_s: 120,         // nearest book must be within ±120 s
};
export const STATES = ["ACTIONABLE", "THIN", "DARK", "NO DATA"];

export const WEEKEND_BOUNDS = [
  ["Fri", "20:00"], ["Sat", "03:00"], ["Sat", "10:00"], ["Sat", "17:00"],
  ["Sun", "00:00"], ["Sun", "07:00"], ["Sun", "14:00"], ["Sun", "21:00"], ["Mon", "04:00"],
];
export const WEEKDAY_BOUNDS = ["20:00", "21:00", "22:00", "23:00",
  "00:00", "01:00", "02:00", "03:00", "04:00"];
const NIGHT_DOWS = { 0: "Mon", 1: "Tue", 2: "Wed", 3: "Thu" };
const DAY_AFTER_NIGHT = { 0: "Tue", 1: "Wed", 2: "Thu", 3: "Fri" };
// Python-weekday convention (Mon=0 … Sun=6) — the session math below is
// ported from engine.py and relies on it. Do NOT mix with the recorder's
// Sun=0 map.
const DOW = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const r1 = (x) => Number(x.toFixed(1));
const r2 = (x) => Number(x.toFixed(2));

function span(b0, b1) {
  return b0[0] === b1[0]
    ? `${b0[0]} ${b0[1]}–${b1[1]} ET`
    : `${b0[0]} ${b0[1]}–${b1[0]} ${b1[1]} ET`;
}

// ---------------------------------------------------------------------------
// Order book + walks
// ---------------------------------------------------------------------------

/** Parse level rows [[price, size], ...]; prices may be strings (spot) or
 *  numbers (perp). Returns (price, size) floats sorted best-first. */
export function levels(rows, side) {
  const lv = rows.map((r) => [Number(r[0]), Number(r[1])]);
  lv.sort((a, b) => (side === "bids" ? b[0] - a[0] : a[0] - b[0]));
  return lv;
}

export function mid(book) {
  return (book.bids[0][0] + book.asks[0][0]) / 2;
}

/** Taker walk: consume levels (one side, best first) until $notional filled. */
export function walk(lv, notionalUsd) {
  let remaining = Number(notionalUsd);
  let cost = 0, qty = 0, used = 0;
  for (const [price, size] of lv) {
    if (remaining <= 1e-9) break;
    const takeQty = Math.min(size, remaining / price);
    cost += price * takeQty;
    qty += takeQty;
    remaining -= price * takeQty;
    used += 1;
  }
  const filled = Number(notionalUsd) - Math.max(remaining, 0);
  return {
    complete: remaining <= 1e-6,
    vwap: qty > 0 ? cost / qty : null,
    levels: used,
    filled_usd: r2(filled),
  };
}

/** All-in round-trip cost in bp: |buy walk| + |sell walk| + 2 x taker fee. */
export function rtCost(book, notionalUsd) {
  const feeRt = 2.0 * TAKER_FEE_BP[book.market];
  const buy = walk(book.asks, notionalUsd);
  const sell = walk(book.bids, notionalUsd);
  const out = {
    fee_rt_bp: feeRt,
    buy_walk_bp: null,
    sell_walk_bp: null,
    rt_bp: null,
    complete: buy.complete && sell.complete,
    levels_buy: buy.levels,
    levels_sell: sell.levels,
    filled_buy_usd: buy.filled_usd,
    filled_sell_usd: sell.filled_usd,
    book_ts_ms: book.ts_ms,
  };
  if (!out.complete) return out;
  const m = mid(book);
  out.buy_walk_bp = Math.abs(buy.vwap / m - 1) * 1e4;
  out.sell_walk_bp = Math.abs(1 - sell.vwap / m) * 1e4;
  out.rt_bp = out.buy_walk_bp + out.sell_walk_bp + feeRt;
  return out;
}

// ---------------------------------------------------------------------------
// Freshness (fills tape): fills = { "NAME:market": { ts: [ms, ...] } }
// ---------------------------------------------------------------------------

export function fillsAt(entry, evalMs) {
  const ts = entry?.ts ?? [];
  // bisect right for ts <= evalMs
  let lo = 0, hi = ts.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (ts[m] <= evalMs) lo = m + 1; else hi = m;
  }
  if (lo === 0) return { observed: false, age_min: null, last_fill_ms: null, n_fills: 0 };
  const last = ts[lo - 1];
  return { observed: true, age_min: (evalMs - last) / 60000, last_fill_ms: last, n_fills: lo };
}

// ---------------------------------------------------------------------------
// Sessions & hour-blocks (America/New_York, wall-clock, DST-aware)
// ---------------------------------------------------------------------------

const etFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", weekday: "short",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function etWall(date) {
  const parts = etFmt.formatToParts(date);
  const g = (t) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    dow: DOW[g("weekday")] ?? -1,
    hour: (parseInt(g("hour"), 10)) % 24,  // h23, but guard odd ICUs
    minute: parseInt(g("minute"), 10),
    second: parseInt(g("second"), 10),
  };
}

/** Returns { session, block_id, block_label }.
 *  weekend = Fri 20:00 ET -> Mon 04:00 ET (8 blocks x 7 wall hours);
 *  weekday_overnight = Mon-Thu 20:00 -> 04:00 ET (8 blocks x 1h);
 *  off_window = everything else. */
export function sessionAndBlock(date) {
  const w = etWall(date);
  const dow = w.dow;
  const h = w.hour + w.minute / 60 + w.second / 3600;

  const isWeekend = (dow === 4 && h >= 20) || dow === 5 || dow === 6 || (dow === 0 && h < 4);
  if (isWeekend) {
    const days = dow === 4 ? 0 : ((dow - 4) + 7) % 7; // Fri0 Sat1 Sun2 Mon3
    const offset = days * 24 + (h - 20);              // wall hours since Fri 20:00
    const idx = Math.min(Math.floor(offset / 7), 7);
    return { session: "weekend", block_id: `we-b${idx}`,
             block_label: span(WEEKEND_BOUNDS[idx], WEEKEND_BOUNDS[idx + 1]) };
  }
  if (h >= 20 || h < 4) {
    const night = h >= 20 ? dow : ((dow - 1) + 7) % 7;
    const idx = h >= 20 ? Math.floor(h) - 20 : 4 + Math.floor(h);
    const day = idx < 4 ? NIGHT_DOWS[night] : DAY_AFTER_NIGHT[night];
    return { session: "weekday_overnight", block_id: `wd-${NIGHT_DOWS[night].toLowerCase()}-h${idx}`,
             block_label: `${day} ${WEEKDAY_BOUNDS[idx]}–${WEEKDAY_BOUNDS[idx + 1]} ET` };
  }
  return { session: "off_window", block_id: null, block_label: null };
}

// ---------------------------------------------------------------------------
// Verdict (deterministic; order per ENGINE_SPEC §5)
// ---------------------------------------------------------------------------

export function classify(perp, spot, fresh, coverage, demo = false) {
  const T = THRESHOLDS;
  const reasons = [];

  // 1) NO DATA (coverage rule waived in demo mode, labelled on the cell)
  if (!coverage.ok && !(demo && coverage.waived)) {
    return ["NO DATA", [`coverage_${coverage.n}<${T.min_snapshots_per_block}`]];
  }

  // 2) DARK — perp leg unusable at this size, too expensive, or tape stale
  let dark = false;
  if (perp === null || !perp.complete) {
    dark = true; reasons.push("perp_book_cannot_fill_size");
  } else if (perp.rt_bp > T.perp_rt_max_bp) {
    dark = true; reasons.push(`perp_rt_${perp.rt_bp.toFixed(1)}bp>${T.perp_rt_max_bp.toFixed(0)}`);
  } else {
    reasons.push(`perp_rt_${perp.rt_bp.toFixed(1)}bp<=${T.perp_rt_max_bp.toFixed(0)}`);
  }
  const pf = fresh.perp;
  if (pf.observed && pf.age_min > T.perp_fresh_max_min) {
    dark = true; reasons.push(`perp_stale_${pf.age_min.toFixed(0)}min>${T.perp_fresh_max_min.toFixed(0)}`);
  }
  if (dark) return ["DARK", reasons];

  // 3) ACTIONABLE — both venues cheap enough AND spot tape fresh (observed)
  let ok = true;
  if (spot === null || !spot.complete) {
    ok = false; reasons.push("spot_book_cannot_fill_size");
  } else if (spot.rt_bp > T.spot_rt_max_bp) {
    ok = false; reasons.push(`spot_rt_${spot.rt_bp.toFixed(1)}bp>${T.spot_rt_max_bp.toFixed(0)}`);
  } else {
    reasons.push(`spot_rt_${spot.rt_bp.toFixed(1)}bp<=${T.spot_rt_max_bp.toFixed(0)}`);
  }
  const sf = fresh.spot;
  if (sf.observed && sf.age_min <= T.spot_fresh_max_min) {
    reasons.push(`spot_fresh_${sf.age_min.toFixed(1)}min<=${T.spot_fresh_max_min.toFixed(0)}`);
  } else if (sf.observed) {
    ok = false; reasons.push(`spot_stale_${sf.age_min.toFixed(0)}min>${T.spot_fresh_max_min.toFixed(0)}`);
  } else {
    ok = false; reasons.push("spot_freshness_unverified"); // conservative
  }
  return [ok ? "ACTIONABLE" : "THIN", reasons];
}

// ---------------------------------------------------------------------------
// Cell / board assembly (evidence object — the UI / Why-chat contract)
// ---------------------------------------------------------------------------

function msToUtc(ms) {
  return new Date(ms).toISOString();
}

function fmtCost(c, book, evalMs, nBooks) {
  if (c === null) return { observed: false, n_books: 0 };
  const d = {
    observed: true,
    n_books: nBooks,
    book_ts_utc: msToUtc(book.ts_ms),
    book_age_s: r1(Math.max(0, (evalMs - book.ts_ms) / 1000)),
    fee_rt_bp: c.fee_rt_bp,
    complete: c.complete,
    levels_buy: c.levels_buy,
    levels_sell: c.levels_sell,
  };
  if (c.complete) {
    d.buy_walk_bp = r1(c.buy_walk_bp);
    d.sell_walk_bp = r1(c.sell_walk_bp);
    d.rt_bp = r1(c.rt_bp);
  } else {
    d.filled_buy_usd = c.filled_buy_usd;
    d.filled_sell_usd = c.filled_sell_usd;
    d.note = "book ran out before filling the size";
  }
  return d;
}

function fmtFresh(f) {
  const d = { observed: f.observed, n_fills: f.n_fills };
  if (f.observed) {
    d.age_min = r1(f.age_min);
    d.last_fill_utc = msToUtc(f.last_fill_ms);
  }
  return d;
}

function coverageOf(n, demo) {
  return {
    n,
    required: THRESHOLDS.min_snapshots_per_block,
    ok: !demo && n >= THRESHOLDS.min_snapshots_per_block,
    waived: !!demo,
  };
}

function cellOf(name, state, reasons, perpPack, spotPack, fresh, coverage, live, nBooks) {
  const cell = { name, state, reasons };
  for (const [m, pack] of [["perp", perpPack], ["spot", spotPack]]) {
    cell[m] = pack === null
      ? { observed: false, n_books: 0 }
      : fmtCost(pack.cost, pack.book, pack.evalMs, nBooks);
  }
  cell.freshness = { spot: fmtFresh(fresh.spot), perp: fmtFresh(fresh.perp) };
  cell.coverage = coverage;
  cell.labels = live
    ? "costs observed from recorded books; freshness observed from fills tape"
    : "costs observed from 1 depth snapshot (demo, coverage rule waived); freshness observed from fills tape";
  return cell;
}

/** be = { spot: Book, perp: Book, fetchedMs }; fills keyed "NAME:market". */
export function buildCell(name, be, fills, sizeUsd, demo, live = null) {
  let evalMs;
  if (live) {
    evalMs = live.evalMs;
    // pre-registration: nearest book must be within ±120 s of the eval ts
    for (const m of ["spot", "perp"]) {
      const book = be[m];
      const ageS = Math.abs(evalMs - book.ts_ms) / 1000;
      if (ageS > THRESHOLDS.max_book_age_s) {
        return cellOf(name, "NO DATA",
          [`book_age_${ageS.toFixed(0)}s>${THRESHOLDS.max_book_age_s}`],
          null, null,
          { spot: fillsAt(null, evalMs), perp: fillsAt(null, evalMs) },
          coverageOf(live.coverageN, false), true, 0);
      }
    }
  } else {
    evalMs = be.fetchedMs;
  }
  const perp = rtCost(be.perp, sizeUsd);
  const spot = rtCost(be.spot, sizeUsd);
  const fresh = {};
  for (const m of ["spot", "perp"]) {
    fresh[m] = fillsAt(fills[`${name}:${m}`], evalMs);
  }
  const coverage = coverageOf(live ? live.coverageN : 1, demo);
  const [state, reasons] = classify(perp, spot, fresh, coverage, demo);
  return cellOf(name, state, reasons,
    { cost: perp, book: be.perp, evalMs },
    { cost: spot, book: be.spot, evalMs },
    fresh, coverage, !!live, live ? (live.nBooks ?? 1) : 1);
}

/** buildBoard(books, fills, sizeUsd, mode, opts)
 *  mode "demo": Phase -1 single-snapshot fixture (coverage waived, labelled).
 *  mode "live": recorder data — opts = { coverageCounts: {NAME: n}, evalDate? }.
 *  Throws Error("off_window: …") in live mode outside overnight windows. */
export function buildBoard(books, fills, sizeUsd, mode = "demo", opts = {}) {
  const demo = mode === "demo";
  let evalMs;
  if (demo) {
    const first = Object.values(books)[0];
    evalMs = first.fetchedMs;
  } else {
    evalMs = opts.evalDate ? opts.evalDate.getTime() : Date.now();
  }
  const { session, block_id, block_label } = sessionAndBlock(new Date(evalMs));
  if (!demo && session === "off_window") {
    throw new Error("off_window: the board evaluates only inside overnight windows " +
      "(Mon–Thu 20:00–04:00 ET nights, Fri 20:00 → Mon 04:00 ET weekends)");
  }
  const cells = [];
  for (const n of NAMES) {
    if (!books[n]) continue;
    if (demo) {
      cells.push(buildCell(n, books[n], fills, sizeUsd, true));
    } else {
      cells.push(buildCell(n, books[n], fills, sizeUsd, false,
        { evalMs, coverageN: (opts.coverageCounts ?? {})[n] ?? 0 }));
    }
  }
  return {
    schema_version: "1.0.0",
    generated_utc: new Date().toISOString(),
    mode,
    eval_utc: new Date(evalMs).toISOString(),
    size_usd: sizeUsd,
    size_label: "$" + sizeUsd.toLocaleString("en-US"),
    session,
    block_id,
    block_label,
    names: cells.map((c) => c.name),
    thresholds: { ...THRESHOLDS },
    fees_rt_bp: { spot: 2 * TAKER_FEE_BP.spot, perp: 2 * TAKER_FEE_BP.perp },
    cells,
    disclaimer: "Overnight execution evidence only — costs, depth and tape " +
      "freshness at your size. Not a prediction, not advice.",
  };
}
