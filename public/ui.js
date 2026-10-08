/* ============================================================================
   Firstlight — /ui.js · all behaviour of the board page (rev4 UI).

   Fetches /api/board?size=…&view=last_night|weekend and renders EVERY square
   from the Supabase recorder via the engine. There is no demo data and no
   fallback values anywhere: unavailable data renders as NO DATA (dashed),
   never invented numbers. The badge flips to LIVE – RECORDED only when the
   response is genuinely mode:"live".

   Everything else mirrors the approved mock (ui-mocks/hero-v2.html rev4):
   the crisp perspective chessboard, the piece layers and the king, the
   scroll game (knight L-hop, bishop diagonal, rook captures the pawn),
   the chess-clock square reveal with the ACTIONABLE glow last, transform/
   opacity only, reduced-motion = static position.
   ============================================================================ */
(function () {
"use strict";
if (typeof document === "undefined") return;   // node import safety (tests)

/* ─────────────────────── pure helpers (unit-tested) ─────────────────────── */
/* @pure-start */
function esc(x) {
  return String(x).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function fmtAge(min) {
  if (min == null) return "—";
  if (min < 60) return Math.round(min) + " min";
  if (min < 1440) return (min / 60).toFixed(1) + " h";
  return (min / 1440).toFixed(1) + " d";
}
function median(xs) {
  if (!xs || !xs.length) return null;
  const v = xs.slice().sort((a, b) => a - b), m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
function stateKey(state) {
  return { ACTIONABLE: "a", THIN: "t", DARK: "d", "NO DATA": "n" }[state] || "n";
}
/* session-wide summary for the hero numbers (observed values only) */
function summarize(board) {
  if (!board || !Array.isArray(board.blocks)) return null;
  let a = 0, t = 0, d = 0, n = 0;
  const perp = [], spot = [];
  for (const b of board.blocks) {
    for (const c of (b.cells || [])) {
      if (c.state === "ACTIONABLE") a++;
      else if (c.state === "THIN") t++;
      else if (c.state === "DARK") d++;
      else n++;
      if (c.perp && c.perp.observed && c.perp.rt_bp != null) perp.push(c.perp.rt_bp);
      if (c.spot && c.spot.observed && c.spot.rt_bp != null) spot.push(c.spot.rt_bp);
    }
  }
  return { a, t, d, n, perpMed: median(perp), nPerp: perp.length,
           spotMed: median(spot), nSpot: spot.length };
}
/* one venue leg of the evidence panel — every number observed + n */
function legLine(label, m) {
  if (!m) return "";
  if (!m.observed || m.rt_bp == null)
    return '<div class="ev"><b>' + label +
      '</b> — not observed (no book within ±120 s of the block)</div>';
  return '<div class="ev"><b>' + label + '</b> all-in RT ' + m.rt_bp.toFixed(1) +
    ' bp <small>observed</small> · ' + m.n_books + ' book' + (m.n_books === 1 ? "" : "s") +
    ' (age ' + m.book_age_s.toFixed(1) + ' s) · depth ' +
    m.levels_buy + '×' + m.levels_sell + ' levels</div>';
}
function tapeLine(f) {
  if (!f) return "";
  const one = (x) => (x && x.observed)
    ? x.age_min.toFixed(1) + " min old (n=" + x.n_fills + " fills)"
    : "unverified (no fills)";
  return '<div class="ev"><b>tape</b> spot ' + one(f.spot) +
    ' · perp ' + one(f.perp) + '</div>';
}
function coverLine(cov) {
  if (!cov) return "";
  return '<div class="ev"><b>cover</b> ' + cov.n + '/' + cov.required +
    ' snapshots per market' + (cov.ok ? "" : " — under the pre-registered minimum") +
    (cov.waived ? " (rule waived in demo mode — labelled)" : "") + '</div>';
}
function fmtN(x) {
  return (x == null || isNaN(x)) ? "—" : Number(x).toLocaleString("en-US");
}
function bp1(x) {
  return x == null ? "no data" : Number(x).toFixed(1) + " bp";
}
/* plain-words mapping of the engine's machine reason codes (audit trail:
   the codes themselves are always shown too, in mono) */
function reasonPhrase(code) {
  const c = String(code || "");
  let m;
  if (c === "spot_freshness_unverified")
    return "the spot tape had no prints, so spot freshness could not be verified";
  if (c === "perp_book_cannot_fill_size")
    return "the perp book could not fill this size";
  if (c === "spot_book_cannot_fill_size")
    return "the spot book could not fill this size";
  if (c === "no_book_within_120s_of_eval")
    return "no book was recorded within ±120 s of the hour";
  if (c === "live_read_unavailable")
    return "the live recorder read was unavailable";
  if ((m = c.match(/^perp_rt_([\d.]+)bp>(\d+)$/)))
    return "the perp all-in cost " + m[1] + " bp exceeded its " + m[2] + " bp pre-registered limit";
  if ((m = c.match(/^spot_rt_([\d.]+)bp>(\d+)$/)))
    return "the spot all-in cost " + m[1] + " bp exceeded its " + m[2] + " bp pre-registered limit";
  if ((m = c.match(/^perp_rt_([\d.]+)bp<=(\d+)$/)))
    return "the perp all-in cost " + m[1] + " bp was within its " + m[2] + " bp limit";
  if ((m = c.match(/^spot_rt_([\d.]+)bp<=(\d+)$/)))
    return "the spot all-in cost " + m[1] + " bp was within its " + m[2] + " bp limit";
  if ((m = c.match(/^perp_stale_(\d+)min>(\d+)$/)))
    return "the perp tape was " + m[1] + " min old, past its " + m[2] + " min freshness limit";
  if ((m = c.match(/^spot_stale_(\d+)min>(\d+)$/)))
    return "the spot tape was " + m[1] + " min old, past its " + m[2] + " min freshness limit";
  if ((m = c.match(/^spot_fresh_([\d.]+)min<=(\d+)$/)))
    return "the spot tape was " + m[1] + " min old, within its freshness limit";
  if ((m = c.match(/^coverage_(\d+)<(\d+)$/)))
    return "coverage was " + m[1] + " snapshots per market, under the " + m[2] + " minimum";
  return c.replace(/_/g, " ");
}
function plainReasons(reasons) {
  return (reasons || []).map(reasonPhrase);
}
/* the venue whose execution quality the evidence supports this hour: perp
   when its all-in RT is within the pre-registered limit; else spot only when
   spot is within its limit AND its tape freshness is verified. Null when
   neither qualifies — then no hand-off button is shown (never a guess). */
function venuePick(cell, T) {
  if (!cell || !T) return null;
  const okLeg = (leg, lim) => !!leg && !!leg.observed && leg.complete !== false &&
    leg.rt_bp != null && leg.rt_bp <= lim;
  if (okLeg(cell.perp, T.perp_rt_max_bp)) return { venue: "perp", rt_bp: cell.perp.rt_bp };
  if (okLeg(cell.spot, T.spot_rt_max_bp) && cell.freshness &&
      cell.freshness.spot && cell.freshness.spot.observed)
    return { venue: "spot", rt_bp: cell.spot.rt_bp };
  return null;
}
/* verified live 2026-10-07 — both patterns resolve (HTTP 200):
   spot  https://www.bitget.com/spot/RNVDAUSDT
   perp  https://www.bitget.com/futures/usdt/NVDAUSDT */
function bitgetUrl(venue, name) {
  if (venue === "perp")
    return "https://www.bitget.com/futures/usdt/" + encodeURIComponent(name) + "USDT";
  if (venue === "spot")
    return "https://www.bitget.com/spot/R" + encodeURIComponent(name) + "USDT";
  return null;
}
/* gauge: perp all-in RT vs its pre-registered limit; the limit sits at 2/3
   of the arc (scale 0 … 1.5 × limit) */
function gaugeData(cell, T) {
  const limit = T ? T.perp_rt_max_bp : 15;
  if (!cell || !cell.perp || !cell.perp.observed || cell.perp.rt_bp == null)
    return { observed: false, limit };
  const v = cell.perp.rt_bp;
  return { observed: true, value: v, limit, over: v > limit,
           frac: Math.min(1, v / (limit * 1.5)) };
}
/* perp vs spot share of the combined all-in round-trip cost */
function splitData(cell) {
  const p = cell && cell.perp && cell.perp.observed ? cell.perp.rt_bp : null;
  const s = cell && cell.spot && cell.spot.observed ? cell.spot.rt_bp : null;
  if (p == null && s == null) return null;
  const tot = ((p || 0) + (s || 0)) || 1;
  return { perpBp: p, spotBp: s,
           perpShare: p == null ? 0 : p / tot, spotShare: s == null ? 0 : s / tot };
}
/* all-in RT per block for one name across the night (null = not observed) */
function costSeries(board, name) {
  const perp = [], spot = [];
  for (const b of (board && board.blocks) || []) {
    const c = (b.cells || []).find((x) => x.name === name);
    perp.push(c && c.perp && c.perp.observed && c.perp.rt_bp != null ? c.perp.rt_bp : null);
    spot.push(c && c.spot && c.spot.observed && c.spot.rt_bp != null ? c.spot.rt_bp : null);
  }
  return { perp, spot };
}
/* fills recorded per block for one name (activity bars) + tape cap flag */
function activitySeries(board, name) {
  const hours = [];
  for (const b of (board && board.blocks) || []) {
    const f = b.fills && b.fills[name];
    hours.push(f ? { spot: f.spot | 0, perp: f.perp | 0 } : { spot: 0, perp: 0 });
  }
  const cap = board && board.tape_capped && board.tape_capped[name];
  return { hours, capped: !!(cap && (cap.perp || cap.spot)) };
}
/* ticker strip: one chip per name — latest COMPLETED block's state + perp
   cost. No prices, no up/down arrows, ever. */
function tickerChips(board) {
  if (!board || board.mode !== "live" || !Array.isArray(board.blocks)) return null;
  const chips = [];
  for (const name of board.names || []) {
    let pick = null, idx = -1;
    board.blocks.forEach((b, i) => {
      const c = (b.cells || []).find((x) => x.name === name);
      if (c && b.complete) { pick = c; idx = i; }
    });
    if (pick) chips.push({ name, state: pick.state, k: stateKey(pick.state), col: idx,
      cost: pick.perp && pick.perp.observed && pick.perp.rt_bp != null
        ? pick.perp.rt_bp : null });
  }
  return chips.length ? { chips } : null;
}
/* SVG polyline points for a real close series inside a w×h box — pure,
   no DOM. One close becomes a short flat segment; empty -> null. */
function closesPath(closes, w, h) {
  if (!Array.isArray(closes) || closes.length < 1) return null;
  const vals = closes.length === 1 ? [closes[0], closes[0]] : closes;
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  const pad = 3;
  const y = (v) => (hi === lo) ? h / 2 : pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
  const x = (i) => (closes.length === 1)
    ? (i === 0 ? w * .35 : w * .65)
    : 1 + i * (w - 2) / (vals.length - 1);
  return vals.map((v, i) => x(i).toFixed(1) + "," + y(v).toFixed(1)).join(" ");
}
/* @pure-end */

/* ─────────── ET session labels — fallbacks when the server line is ────────
   missing (calendar math only; same rule as the server adapter, verified
   against it on the edge cases: in-progress nights excluded, weekends). */
function etParts() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23",
    weekday: "short", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric" });
  const p = {}; for (const q of fmt.formatToParts(new Date())) p[q.type] = q.value;
  return p;
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const WDN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const calLabel = (utcMs) => {
  const d = new Date(utcMs);
  return MON[d.getUTCMonth()] + " " + d.getUTCDate();
};
function etLastNightLabel() {
  const p = etParts();
  const wd = WD[p.weekday];
  const nowMin = (+p.hour) * 60 + (+p.minute);
  const todayUtc = Date.UTC(+p.year, (+p.month) - 1, +p.day);
  for (let k = 1; k <= 10; k++) {
    const w = ((wd - k) % 7 + 7) % 7;              // JS weekdays: Mon=1 … Thu=4
    if (w < 1 || w > 4) continue;                  // weekday-night starts only
    if (!(k > 1 || nowMin >= 240)) continue;       // completed only (04:00 ET)
    const d0 = todayUtc - k * 86400000, d1 = d0 + 86400000;
    return "Last night · " + WDN[w] + " " + calLabel(d0) + " 20:00 → " +
      WDN[w + 1] + " " + calLabel(d1) + " 04:00 ET · 8 blocks × 1h";
  }
  return "Last night · 20:00 → 04:00 ET · 8 blocks × 1h";
}
function etWeekendLabel() {
  const p = etParts();
  const wd = WD[p.weekday];
  const nowMin = (+p.hour) * 60 + (+p.minute);
  const todayUtc = Date.UTC(+p.year, (+p.month) - 1, +p.day);
  for (let k = 0; k <= 13; k++) {
    const w = ((wd - k) % 7 + 7) % 7;
    if (w !== 5) continue;                         // Fridays (JS: Fri=5)
    if (!(k > 0 || nowMin >= 1200)) continue;      // session started (Fri 20:00 ET)
    const fri = todayUtc - k * 86400000, mon = fri + 3 * 86400000;
    return "Weekend · Fri " + calLabel(fri) + " 20:00 → Mon " + calLabel(mon) +
      " 04:00 ET · 8 blocks × 7h";
  }
  return "Weekend · Fri 20:00 → Mon 04:00 ET · 8 blocks × 7h";
}

/* ─────────────────────────── view metadata (fixed) ──────────────────────── */
const NAMES_FALLBACK = ["NVDA", "TSLA", "AAPL", "MSFT", "SPY"];
const ICONS = { a: "●", t: "◐", d: "○", n: "·" };
const LABELS = { a: "actionable", t: "thin", d: "dark", n: "no data" };
const VIEWS = {
  last_night: {
    headers: ["8p", "9p", "10p", "11p", "12a", "1a", "2a", "3a"],
    times: ["8p", "9p", "10p", "11p", "12a", "1a", "2a", "3a"],
    blocks: ["20:00–21:00", "21:00–22:00", "22:00–23:00", "23:00–00:00",
             "00:00–01:00", "01:00–02:00", "02:00–03:00", "03:00–04:00"],
    aria: "Last night board, 5 names by 8 hourly blocks, ET",
    sessionFallback: etLastNightLabel,
    note: '<b>Every square is recorder data — computed by the engine from ' +
      'Supabase.</b> Books within ±120 s of the hour, tape freshness with n, ' +
      'coverage per market. An hour with fewer than 30 snapshots per market ' +
      'stays <b>NO DATA</b> (dashed) and nothing is estimated. The badge reads ' +
      '<b>LIVE – RECORDED</b> only while numbers come from Supabase; the stamp ' +
      'shows how long ago the recorder last wrote. Tap any square for its evidence.'
  },
  weekend: {
    headers: ["Fri 20", "Sat 03", "Sat 10", "Sat 17", "Sun 00", "Sun 07", "Sun 14", "Sun 21"],
    times: ["Fri 8p", "Sat 3a", "Sat 10a", "Sat 5p", "Sun 12a", "Sun 7a", "Sun 2p", "Sun 9p"],
    blocks: ["Fri 20:00–03:00", "Sat 03:00–10:00", "Sat 10:00–17:00", "Sat 17:00–00:00",
             "Sun 00:00–07:00", "Sun 07:00–14:00", "Sun 14:00–21:00", "Sun 21:00–04:00"],
    aria: "Weekend board, 5 names by 8 blocks of 7 hours, ET",
    sessionFallback: etWeekendLabel,
    note: '<b>The weekend board fills in with real recordings as their hours ' +
      'complete.</b> Same rule, no inventions: anything the recorder didn\'t ' +
      'capture stays <b>NO DATA</b> (dashed); no value is ever estimated from ' +
      'thin coverage. Tap any square for its evidence.'
  }
};

/* ══════════════════════ the real-data board (no demo data) ══════════════════════ */
const grid = document.getElementById("grid");
const ev = document.getElementById("evidence");
const sessionLine = document.getElementById("sessionLine");
const badge = document.getElementById("badge");
const stamp = document.getElementById("stamp");
const note = document.getElementById("note");
const costValue = document.getElementById("costValue");
const costSub = document.getElementById("costSub");
const tapeValue = document.getElementById("tapeValue");
const tapeSub = document.getElementById("tapeSub");
const verdictValue = document.getElementById("verdictValue");
const verdictSub = document.getElementById("verdictSub");
const statePill = document.getElementById("statePill");
const tickerbar = document.getElementById("tickerbar");
const tickerIn = document.getElementById("tickerIn");

let size = 1000, view = "last_night", current = null, boardSeen = false;
let namesOrder = ["NVDA", "TSLA", "AAPL", "MSFT", "SPY"];
const cells = {};

function buildGrid(names, blocks) {
  const V = VIEWS[view];
  namesOrder = names.slice();
  grid.setAttribute("aria-label", V.aria);
  grid.innerHTML = "";
  for (const k in cells) delete cells[k];
  const corner = document.createElement("span");
  corner.className = "hd hd--corner";
  grid.appendChild(corner);
  V.headers.forEach((h) => {
    const e = document.createElement("span");
    e.className = "hd"; e.textContent = h;
    grid.appendChild(e);
  });
  names.forEach((name, r) => {
    const row = document.createElement("div");
    row.className = "row";                    /* display:contents >=640px */
    const nm = document.createElement("span");
    nm.className = "nm"; nm.textContent = name;
    row.appendChild(nm);
    for (let c = 0; c < 8; c++) {
      const cell = blocks && blocks[c]
        ? (blocks[c].cells || []).find((x) => x.name === name) || null : null;
      const state = cell ? cell.state : "NO DATA";
      const k = stateKey(state);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sq" + (((r + c) % 2) ? " alt" : "");
      b.dataset.state = k; b.dataset.name = name; b.dataset.col = c;
      const blab = blocks && blocks[c] && blocks[c].block_label
        ? blocks[c].block_label                    /* server label ends with " ET" */
        : V.blocks[c] + " ET";                     /* static fallback needs it */
      b.setAttribute("aria-label", name + ", " + blab +
        ", " + state + (k === "n" ? " — tap for why" : " — tap for evidence"));
      const px = cell && cell.px != null ? cell.px : null;
      const bp = cell && cell.perp && cell.perp.rt_bp != null ? cell.perp.rt_bp : null;
      const cs = cell && Array.isArray(cell.closes) ? cell.closes : null;
      const up = cs && cs.length > 1 && cs[cs.length - 1] >= cs[0];
      const pts = cs && cs.length ? closesPath(cs, 100, 26) : null;
      b.innerHTML =
        '<span class="sq__top"><b class="sq__nm">' + name + '</b>' +
          '<span class="sq__px">' + (px != null ? px.toFixed(2) : 'no data') + '</span></span>' +
        (pts
          ? '<svg class="sq__chart" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true">' +
            '<polyline fill="none" stroke="' + (up ? '#D4B07A' : '#EFE9DC') +
            '" stroke-width="1.6" stroke-linejoin="round" points="' + pts + '"/></svg>'
          : '<span class="sq__chart sq__chart--none" aria-hidden="true"></span>') +
        '<span class="sq__bot"><span class="sq__bp">' +
          (bp != null ? bp.toFixed(1) + ' bp' : 'no data') + '</span>' +
          '<span class="sq__vd"><i class="g" aria-hidden="true">' + ICONS[k] + '</i>' +
            LABELS[k] + '</span></span>' +
        '<span class="tm" aria-hidden="true">' + V.times[c] + '</span>';
      row.appendChild(b);
      cells[name + ":" + c] = { btn: b, cell, block: blocks ? blocks[c] : null };
    }
    grid.appendChild(row);
  });

  if (boardSeen) lightSquares();
}

/* chess-clock reveal — column by column, ACTIONABLE glow last */
const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
function lightSquares() {
  const squares = [...grid.querySelectorAll(".sq")];
  if (rm) { squares.forEach((s) => s.classList.add("lit")); return; }
  squares.forEach((s) => {
    const r = Math.max(0, namesOrder.indexOf(s.dataset.name));
    const c = +s.dataset.col;
    const d = (c * 5 + r) * 65;               /* one column at a time */
    setTimeout(() => s.classList.add("lit"), d);
    if (s.dataset.state === "a")
      setTimeout(() => s.classList.add("glow"), d + 380);
  });
}

/* ── evidence panel components — hand-drawn SVG, no chart library ── */
function gaugeSvg(g, name) {
  const cx = 75, cy = 78, r = 58;
  const pt = (frac, rad) => {
    const a = Math.PI * (1 - frac);              // left end -> right end
    return [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  };
  const arc = (f0, f1, rad) => {
    const s = pt(f0, rad), e = pt(f1, rad);
    return "M " + s[0].toFixed(2) + " " + s[1].toFixed(2) +
      " A " + rad + " " + rad + " 0 0 1 " + e[0].toFixed(2) + " " + e[1].toFixed(2);
  };
  const limFrac = 1 / 1.5;                       // limit at 2/3 of the arc
  const lt0 = pt(limFrac, r - 11), lt1 = pt(limFrac, r + 11);
  const aria = g.observed
    ? name + " perp all-in round-trip cost " + g.value.toFixed(1) +
      " bp against the " + g.limit + " bp pre-registered limit"
    : name + " perp all-in round-trip cost: no data";
  let s = '<svg class="gauge" viewBox="0 0 150 100" role="img" aria-label="' + esc(aria) + '">';
  s += '<path d="' + arc(0, 1, r) + '" fill="none" stroke="rgba(155,134,120,.34)" stroke-width="7" stroke-linecap="round"' +
    (g.observed ? "" : ' stroke-dasharray="4 6"') + '/>';
  if (g.observed) {
    s += '<path d="' + arc(0, Math.max(0.0015, g.frac), r) + '" fill="none" stroke="' +
      (g.over ? "#E8CBA0" : "var(--gold)") + '" stroke-width="7" stroke-linecap="round"' +
      (g.over ? ' stroke-dasharray="9 5"' : "") + '"/>';
  }
  s += '<line x1="' + lt0[0].toFixed(1) + '" y1="' + lt0[1].toFixed(1) + '" x2="' + lt1[0].toFixed(1) +
    '" y2="' + lt1[1].toFixed(1) + '" stroke="var(--gold)" stroke-width="2"/>';
  const lab = pt(limFrac, r + 20);
  s += '<text x="' + lab[0].toFixed(1) + '" y="' + lab[1].toFixed(1) +
    '" class="gauge__lim" text-anchor="middle">limit ' + g.limit + '</text>';
  if (g.observed) {
    s += '<text x="75" y="68" class="gauge__v" text-anchor="middle">' + g.value.toFixed(1) + '</text>' +
      '<text x="75" y="84" class="gauge__u" text-anchor="middle">bp all-in RT · perp</text>' +
      (g.over ? '<text x="75" y="96" class="gauge__over" text-anchor="middle">over the limit</text>' : "");
  } else {
    s += '<text x="75" y="68" class="gauge__v" text-anchor="middle">—</text>' +
      '<text x="75" y="84" class="gauge__u" text-anchor="middle">no data · perp leg</text>';
  }
  return s + '</svg>';
}
function tileHtml(label, value, sub, ok) {
  return '<div class="evt' + (ok ? "" : " evt--nd") + '"><span class="evt__l">' + label +
    '</span><span class="evt__v">' + value + '</span><span class="evt__s">' + sub + '</span></div>';
}
function tilesHtml(c, fees) {
  const p = c && c.perp, s = c && c.spot, f = c && c.freshness;
  const perpOk = !!(p && p.observed && p.rt_bp != null);
  const spotOk = !!(s && s.observed && s.rt_bp != null);
  const tapeOk = !!(f && f.perp && f.perp.observed);
  const cov = c && c.coverage;
  return tileHtml("perp cost", perpOk ? p.rt_bp.toFixed(1) + ' <i>bp</i>' : "—",
      perpOk ? "n=" + p.n_books + " book · incl. " + (fees ? fees.perp : 12) + " bp fees" : "no book within ±120 s",
      perpOk) +
    tileHtml("spot cost", spotOk ? s.rt_bp.toFixed(1) + ' <i>bp</i>' : "—",
      spotOk ? "n=" + s.n_books + " book · incl. " + (fees ? fees.spot : 20) + " bp fees" : "no book within ±120 s",
      spotOk) +
    tileHtml("tape age", tapeOk ? f.perp.age_min.toFixed(1) + ' <i>min</i>' : "—",
      tapeOk ? "perp tape · n=" + fmtN(f.perp.n_fills) + " fills" : "no fills on the recorded tape",
      tapeOk) +
    tileHtml("coverage", cov ? cov.n + "/" + cov.required : "—",
      cov ? (cov.ok ? "snapshots per market · ok" : "under the pre-registered minimum") : "no data",
      !!(cov && cov.ok));
}
function splitHtml(sd, sizeLabel) {
  if (!sd) return '<div class="evsplit evsplit--nd">venue split — no data (neither book was observed within ±120 s)</div>';
  const seg = (cls, share, lab) =>
    '<div class="evsplit__seg evsplit__seg--' + cls + '" style="width:' +
    (share * 100).toFixed(1) + '%">' + (share >= 0.16 ? lab : "") + '</div>';
  return '<div class="evsplit"><div class="evsplit__bar">' +
    (sd.perpBp != null ? seg("perp", sd.perpShare, "perp " + sd.perpBp.toFixed(1) + " bp") : "") +
    (sd.spotBp != null ? seg("spot", sd.spotShare, "spot " + sd.spotBp.toFixed(1) + " bp") : "") +
    '</div><span class="evsplit__cap">share of combined all-in round-trip cost at ' +
    esc(sizeLabel || "") + ' — perp gold · spot cream' +
    (sd.perpBp != null && sd.spotBp != null
      ? (sd.perpBp <= sd.spotBp ? " · perp is the cheaper leg this hour" : " · spot is the cheaper leg this hour")
      : "") + '</span></div>';
}
function kvHtml(c, hourFills, fees) {
  const p = c && c.perp, s = c && c.spot;
  const one = (leg) => leg && leg.observed
    ? leg.book_age_s.toFixed(1) + " s" : "no data";
  const lv = (leg) => leg && leg.observed
    ? leg.levels_buy + "×" + leg.levels_sell : "no data";
  const row = (k, v) => '<div class="kv"><span class="kv__k">' + k + '</span><span class="kv__v">' + v + '</span></div>';
  return '<div class="evkv">' +
    row("book age", "perp " + one(p) + " · spot " + one(s)) +
    row("depth levels", "perp " + lv(p) + " · spot " + lv(s)) +
    row("fills in this hour", hourFills
      ? "perp " + fmtN(hourFills.perp) + " · spot " + fmtN(hourFills.spot) : "no data") +
    row("fees (round trip)", fees
      ? "perp " + fees.perp + " bp · spot " + fees.spot + " bp" : "no data") +
    '</div>';
}
/* line chart: all-in RT across the night; gaps where a leg was not observed */
function costLineSvg(cs, T, sel, headers) {
  const W = 320, H = 136, L = 34, R = 30, T0 = 12, B = 18;
  const xs = (i) => L + i * (W - L - R) / 7;
  const vals = [];
  cs.perp.forEach((v) => v != null && vals.push(v));
  cs.spot.forEach((v) => v != null && vals.push(v));
  if (T) vals.push(T.perp_rt_max_bp, T.spot_rt_max_bp);
  if (!vals.length) return '<div class="evchart__nd">no observed costs this night — nothing is drawn</div>';
  const ymax = Math.max.apply(null, vals) * 1.12;
  const ys = (v) => T0 + (1 - v / ymax) * (H - T0 - B);
  const runs = (arr) => {
    const out = []; let cur = null;
    arr.forEach((v, i) => {
      if (v == null) { cur = null; return; }
      const p = xs(i).toFixed(1) + " " + ys(v).toFixed(1);
      if (!cur) { cur = ["M " + p]; out.push(cur); } else cur.push("L " + p);
    });
    return out.map((r) => r.join(" "));
  };
  const dots = (arr, cls) => arr.map((v, i) => v == null ? "" :
    '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(v).toFixed(1) +
    '" r="' + (i === sel ? 3.4 : 2.3) + '" class="' + cls + (i === sel ? " evchart__dot--sel" : "") + '"/>').join("");
  let s = '<svg class="evchart__svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
    'all-in round-trip cost by hour: gold perp, cream spot; dashed lines are the pre-registered limits">' +
    '<line x1="' + L + '" y1="' + ys(0).toFixed(1) + '" x2="' + (W - R) + '" y2="' + ys(0).toFixed(1) +
    '" class="evchart__axis"/>';
  if (T) {
    s += '<line x1="' + L + '" y1="' + ys(T.perp_rt_max_bp).toFixed(1) + '" x2="' + (W - R) +
      '" y2="' + ys(T.perp_rt_max_bp).toFixed(1) + '" class="evchart__lim evchart__lim--perp"/>' +
      '<text x="' + (W - R + 3) + '" y="' + (ys(T.perp_rt_max_bp) + 3).toFixed(1) + '" class="evchart__limt">' + T.perp_rt_max_bp + '</text>' +
      '<line x1="' + L + '" y1="' + ys(T.spot_rt_max_bp).toFixed(1) + '" x2="' + (W - R) +
      '" y2="' + ys(T.spot_rt_max_bp).toFixed(1) + '" class="evchart__lim evchart__lim--spot"/>' +
      '<text x="' + (W - R + 3) + '" y="' + (ys(T.spot_rt_max_bp) + 3).toFixed(1) + '" class="evchart__limt">' + T.spot_rt_max_bp + '</text>';
  }
  s += runs(cs.spot).map((d) => '<path d="' + d + '" class="evchart__line evchart__line--spot"/>').join("");
  s += runs(cs.perp).map((d) => '<path d="' + d + '" class="evchart__line evchart__line--perp"/>').join("");
  s += dots(cs.spot, "evchart__dot evchart__dot--spot") + dots(cs.perp, "evchart__dot evchart__dot--perp");
  if (sel >= 0) s += '<line x1="' + xs(sel).toFixed(1) + '" y1="' + T0 + '" x2="' + xs(sel).toFixed(1) +
    '" y2="' + ys(0).toFixed(1) + '" class="evchart__sel"/>';
  headers.forEach((h, i) => {
    s += '<text x="' + xs(i).toFixed(1) + '" y="' + (H - 5) + '" class="evchart__xl" text-anchor="middle">' + esc(h) + '</text>';
  });
  return s + '</svg>';
}
/* activity bars: fills recorded per hour, perp vs spot — a silent spot tape
   is visible at a glance */
function activitySvg(act, sel, headers) {
  const W = 320, H = 96, L = 34, R = 10, T0 = 16, B = 18;
  const xs = (i) => L + i * (W - L - R) / 7;
  let max = 0;
  act.hours.forEach((h) => { max = Math.max(max, h.spot, h.perp); });
  if (!max) return '<div class="evact__nd">no fills recorded this night — the panel stays empty rather than inventing activity</div>';
  const base = H - B;
  const bar = (i, v, cls, off) => {
    const hgt = Math.max(v ? 2 : 0, (v / max) * (base - T0));
    const x = xs(i) + off;
    return '<rect x="' + x.toFixed(1) + '" y="' + (base - hgt).toFixed(1) +
      '" width="9" height="' + hgt.toFixed(1) + '" class="' + cls + '">' +
      (v ? "<title>" + v + " fills</title>" : "") + "</rect>";
  };
  let s = '<svg class="evact__svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' +
    'fills recorded per hour: gold perp, cream spot' + (act.capped ? "; busy tapes are page-capped so hours can under-count" : "") + '">' +
    '<line x1="' + L + '" y1="' + base + '" x2="' + (W - R) + '" y2="' + base + '" class="evchart__axis"/>';
  act.hours.forEach((h, i) => {
    s += bar(i, h.perp, "evact__b evact__b--perp" + (act.capped ? " evact__b--cap" : ""), -10);
    s += bar(i, h.spot, "evact__b evact__b--spot" + (act.capped ? " evact__b--cap" : ""), 1);
    if (h.perp) s += '<text x="' + (xs(i) - 5.5).toFixed(1) + '" y="' + (base - (h.perp / max) * (base - T0) - 3).toFixed(1) +
      '" class="evact__n">' + (h.perp >= 1000 ? "999+" : h.perp) + '</text>';
  });
  if (sel >= 0) s += '<line x1="' + xs(sel).toFixed(1) + '" y1="' + T0 + '" x2="' + xs(sel).toFixed(1) +
    '" y2="' + base + '" class="evchart__sel"/>';
  headers.forEach((h, i) => {
    s += '<text x="' + xs(i).toFixed(1) + '" y="' + (H - 5) + '" class="evchart__xl" text-anchor="middle">' + esc(h) + '</text>';
  });
  return s + '</svg>';
}

/* evidence — opens on tap: the mini trading panel, every number observed
   with its n, gaps shown as no data */
function showEvidence(name, col) {
  const rec = cells[name + ":" + col];
  if (!rec) return;
  Object.values(cells).forEach((r) => r.btn.classList.remove("sel"));
  rec.btn.classList.add("sel");
  const c = rec.cell, blk = rec.block;
  const bl = blk && blk.block_label ? blk.block_label : VIEWS[view].blocks[col] + " ET";
  const k = c ? stateKey(c.state) : "n";
  const T = current && current.thresholds ? current.thresholds : null;
  const fees = current && current.fees_rt_bp ? current.fees_rt_bp : null;
  const sizeLabel = current && current.size_label ? current.size_label : ("$" + size.toLocaleString("en-US"));
  const hourFills = blk && blk.fills ? (blk.fills[name] || null) : null;
  const headers = VIEWS[view].headers;

  let h = '<div class="evidence__head">' +
    '<span class="evidence__name">' + esc(name) + '</span>' +
    '<span class="evidence__block">' + esc(bl) + '</span>' +
    '<span class="state state--' + k + '"><span class="state__g" aria-hidden="true">' +
    ICONS[k] + '</span>' + (c ? esc(c.state) : "NO DATA") + '</span></div>';

  /* gauge + 2×2 tiles */
  h += '<div class="evgrid">' +
    '<div class="evgauge">' + gaugeSvg(gaugeData(c, T), name) + '</div>' +
    '<div class="evtiles">' + tilesHtml(c, fees) + '</div></div>';

  /* perp vs spot split bar */
  h += splitHtml(c ? splitData(c) : null, sizeLabel);

  /* key/value rows with hairlines */
  h += kvHtml(c, hourFills, fees);

  /* the reason in plain words (machine codes always shown too) */
  const phrases = c && c.reasons ? plainReasons(c.reasons) : [];
  h += '<p class="evwhy"><b>' + (c ? esc(c.state) : "NO DATA") + '</b>' +
    (phrases.length ? " — " + phrases.map(esc).join("; ") : " — no data for this hour; nothing is estimated from thin coverage.") +
    '</p>';
  if (c && c.reasons && c.reasons.length)
    h += '<p class="evwhy__codes">' + c.reasons.map(esc).join(" · ") + '</p>';

  /* charts across the night */
  h += '<div class="evchart">' + costLineSvg(costSeries(current, name), T, col, headers) +
    '<span class="evchart__cap">all-in round-trip cost by hour · gold perp (limit ' +
    (T ? T.perp_rt_max_bp : 15) + ' bp) · cream spot (limit ' + (T ? T.spot_rt_max_bp : 35) +
    ' bp) · gaps = not observed</span></div>';
  h += '<div class="evact">' + activitySvg(activitySeries(current, name), col, headers) +
    '<span class="evact__cap">fills recorded per hour · gold perp · cream spot — a silent spot tape is itself evidence' +
    (activitySeries(current, name).capped
      ? " · hatched = tape page-capped (newest 1,000 prints), hours can under-count" : "") +
    '</span></div>';

  /* trade hand-off (Part C) — only when the evidence supports a venue */
  const vp = c ? venuePick(c, T) : null;
  if (vp) {
    const url = bitgetUrl(vp.venue, name);
    h += '<div class="evhandoff"><a class="bitgetbtn" href="' + url +
      '" target="_blank" rel="noopener noreferrer">Open ' + esc(name) + " " +
      (vp.venue === "perp" ? "perp" : "rToken spot") + ' on Bitget ↗</a>' +
      '<p class="evhandoff__x">You confirm and trade on Bitget. Firstlight shows execution quality, never direction.</p></div>';
  } else {
    h += '<div class="evhandoff evhandoff--nd">no venue within its pre-registered limits this hour — no hand-off offered</div>';
  }

  /* Why (Part D) — explained only from this square's evidence object */
  h += '<div class="whysec"><button type="button" class="whybtn" id="whyBtn">' +
    'Why this square?</button><div class="whyout" id="whyOut" hidden></div></div>';

  if (c && current && current.fees_rt_bp)
    h += '<div class="evidence__rule">all-in = book walk + fees (perp ' +
      current.fees_rt_bp.perp + ' bp · spot ' + current.fees_rt_bp.spot +
      ' bp round trip) · thresholds pre-registered · execution quality, never direction</div>';

  ev.classList.add("open");
  ev.innerHTML = h;

  const whyBtn = ev.querySelector("#whyBtn");
  const whyOut = ev.querySelector("#whyOut");
  if (whyBtn) whyBtn.addEventListener("click", async () => {
    whyOut.hidden = false;
    whyOut.innerHTML = '<p class="whyout__load">explaining from the evidence…</p>';
    try {
      const r = await fetch("/api/why?name=" + encodeURIComponent(name) +
        "&block=" + col + "&size=" + size + "&view=" + view);
      const j = await r.json();
      whyOut.innerHTML =
        '<p class="whyout__t">' + esc(j && j.text ? j.text : "no data") + '</p>' +
        '<p class="whyout__src">source: ' + (j && j.source === "model"
          ? "LLM · evidence-locked" : "built-in narrator · deterministic") + '</p>' +
        (j && j.footer ? '<p class="whyout__f">' + esc(j.footer) + '</p>' : "");
    } catch (e) {
      whyOut.innerHTML = '<p class="whyout__t">no data — the explanation service is unreachable right now.</p>';
    }
  });
}
grid.addEventListener("click", (e) => {
  const b = e.target.closest(".sq");
  if (b) showEvidence(b.dataset.name, +b.dataset.col);
});

/* ─── apply one /api/board response to the whole page ─── */
function applyBoard(board) {
  const live = !!(board && board.mode === "live" && Array.isArray(board.blocks));
  const names = (board && board.names && board.names.length)
    ? board.names : namesOrder;

  sessionLine.textContent =
    board && board.session && board.session.label
      ? board.session.label + (board.session.in_progress ? " · in progress" : "")
      : VIEWS[view].sessionFallback();

  if (board && board.recorded && board.recorded.age_min != null) {
    stamp.textContent = "recorded · " + fmtAge(board.recorded.age_min) + " ago";
    stamp.title = "recorder heartbeat " + (board.recorded.ts_utc || "");
  } else {
    stamp.textContent = "recorded · —";
    stamp.title = "no recorder rows yet";
  }

  if (live) {
    badge.className = "chip chip--live";
    badge.textContent = "LIVE – RECORDED";
    badge.title = "every number on this board comes from the Supabase recorder";
  } else {
    badge.className = "chip chip--nd";
    badge.textContent = "no data — live read unavailable";
    badge.title = (board && board.note) || "the live read failed; nothing is invented";
  }

  /* the hero state light — switches to the real state when the board lands */
  if (statePill) {
    if (live) {
      statePill.textContent = "LIVE – RECORDED";
      statePill.className = "scene__chip scene__chip--live";
      statePill.title = "numbers come from the Supabase recorder";
    } else {
      statePill.textContent = "NO DATA · LIVE READ UNAVAILABLE";
      statePill.className = "scene__chip";
      statePill.title = (board && board.note) || "the live read failed; nothing is invented";
    }
  }

  /* ticker strip + the gold line on the board floor */
  renderTickers(board);

  note.innerHTML = VIEWS[view].note + (live ? "" :
    " <b>Live read unavailable:</b> " +
    esc((board && board.note) || "unknown reason") +
    ". Every square stays NO DATA until the read succeeds — nothing is estimated.");

  buildGrid(names, live ? board.blocks : null);

  /* hero numbers — observed values only, n with every figure */
  const s = summarize(live ? board : null);
  if (s && s.nPerp > 0) {
    costValue.textContent = s.perpMed.toFixed(1) + " bp";
    costSub.textContent = "median perp all-in round-trip across " + s.nPerp +
      " observed squares at " + (board.size_label || ("$" + size.toLocaleString("en-US"))) +
      (s.nSpot > 0 ? " · spot median " + s.spotMed.toFixed(1) + " bp" : "") +
      " · observed, never estimated";
  } else {
    costValue.textContent = "—";
    costSub.textContent = live
      ? "no observed squares yet — a square needs >=30 snapshots per market and a book within ±120 s"
      : "live read unavailable — see the note under the board";
  }
  if (board && board.recorded && board.recorded.age_min != null) {
    tapeValue.textContent = fmtAge(board.recorded.age_min);
    tapeSub.textContent = "since the recorder's last write (heartbeat) · every figure carries its n";
  } else {
    tapeValue.textContent = "—";
    tapeSub.textContent = "no recorder heartbeat received yet";
  }
  if (s) {
    verdictValue.textContent = String(s.a) + " actionable";
    verdictSub.textContent = "ACTIONABLE hours · " + s.t + " THIN · " + s.d +
      " DARK · " + s.n + " NO DATA — execution quality only, never direction";
  } else {
    verdictValue.textContent = "—";
    verdictSub.textContent = "verdicts appear only from recorded data";
  }
}

/* ─── ticker strip: one chip per name — verdict + perp cost, no prices ─── */
function renderTickers(board) {
  if (!tickerbar || !tickerIn) return;
  const t = tickerChips(board);
  if (!t) {
    tickerIn.innerHTML = '<span class="tk tk--wait">' +
      (board && board.mode === "error"
        ? "no data · live read unavailable" : "reading the recorder…") + '</span>';
    return;
  }
  tickerIn.innerHTML = "";
  for (const c of t.chips) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tk tk--" + c.k;
    b.dataset.name = c.name;
    b.dataset.col = c.col;
    b.setAttribute("aria-label", c.name + ", latest completed hour, " + c.state +
      (c.cost != null ? ", perp all-in round trip " + c.cost.toFixed(1) + " bp"
        : ", perp cost no data") + " — open its evidence");
    b.innerHTML = '<b>' + esc(c.name) + '</b>' +
      '<span class="tk__g" aria-hidden="true">' + ICONS[c.k] + '</span>' +
      '<span class="tk__s">' + LABELS[c.k] + '</span>' +
      '<span class="tk__c">' + (c.cost != null ? c.cost.toFixed(1) + " bp" : "—") + '</span>';
    tickerIn.appendChild(b);
  }
  tickerbar.hidden = false;
}
tickerIn && tickerIn.addEventListener("click", (e) => {
  const b = e.target.closest(".tk");
  if (!b) return;
  showEvidence(b.dataset.name, +b.dataset.col);
  const board = document.getElementById("board");
  if (board) board.scrollIntoView({ behavior: rm ? "auto" : "smooth" });
});

/* ─── alerts bell — scoped feature, honestly labelled, not live yet ─── */
const bellBtn = document.getElementById("bellBtn");
const bellPop = document.getElementById("bellPop");
if (bellBtn && bellPop) {
  const setPop = (open) => {
    bellPop.hidden = !open;
    bellBtn.setAttribute("aria-expanded", String(open));
  };
  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setPop(bellPop.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!bellPop.hidden && !bellPop.contains(e.target) && !bellBtn.contains(e.target))
      setPop(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setPop(false);
  });
}

/* ─── fetch (real product: no demo fallback, ever) ─── */
async function loadBoard() {
  badge.className = "chip";
  badge.textContent = "reading recorder…";
  let board = null;
  try {
    const r = await fetch("/api/board?size=" + size + "&view=" + view);
    board = await r.json();
  } catch (e) {
    board = { mode: "error", note: "request failed — the API route or network is unreachable" };
  }
  current = board;
  applyBoard(board);
}

/* view + size toggles */
function syncToggles() {
  document.querySelectorAll(".views button[data-view]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  document.querySelectorAll(".sizes button[data-size]").forEach((b) =>
    b.setAttribute("aria-pressed", String(+b.dataset.size === size)));
}
document.querySelectorAll(".views button[data-view]").forEach((b) =>
  b.addEventListener("click", () => {
    if (b.dataset.view === view) return;
    view = b.dataset.view;
    syncToggles(); ev.classList.remove("open"); loadBoard();
  }));
document.querySelectorAll(".sizes button[data-size]").forEach((b) =>
  b.addEventListener("click", () => {
    if (+b.dataset.size === size) return;
    size = +b.dataset.size;
    syncToggles(); ev.classList.remove("open"); loadBoard();
  }));

/* initial paint: honest NO DATA placeholders, then the real board */
note.innerHTML = VIEWS[view].note;
buildGrid(namesOrder, null);
loadBoard();

/* ─── reveal: panes scale .95→1 and rise; board triggers the clock ─── */
const revs = document.querySelectorAll(".reveal");
if (rm || !("IntersectionObserver" in window)) {
  revs.forEach((el) => el.classList.add("in"));
  boardSeen = true; lightSquares();
} else {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        if (en.target.id === "boardPanel" && !boardSeen) { boardSeen = true; lightSquares(); }
        io.unobserve(en.target);
      }
    });
  }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });
  revs.forEach((el) => io.observe(el));
}

})();
