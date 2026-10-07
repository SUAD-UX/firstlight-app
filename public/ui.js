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

/* ══════════ THE CHESSBOARD — crisp perspective plane behind the page ══════════
   Dark #0E0A07 / light #4A3A26 squares, gold grid lines at 25%, gold trim
   edge. NO blur filter ever touches the board; only the far horizon fades. */
const NS = "http://www.w3.org/2000/svg";
const boardsvg = document.getElementById("boardsvg");
function buildBoardPlane() {
  const W = innerWidth, H = innerHeight;
  boardsvg.setAttribute("viewBox", "0 0 " + W + " " + H);
  boardsvg.setAttribute("width", W);
  boardsvg.setAttribute("height", H);
  boardsvg.innerHTML = "";
  const el = (t, a) => { const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]); boardsvg.appendChild(e); return e; };

  const files = 8, ranks = 12, growth = 1.24;   /* perspective growth per rank */
  const hy = Math.round(H * .32);               /* the horizon                 */
  const by = Math.round(H * 1.04);              /* board bottom, just past the fold */
  const span = by - hy, cx = W / 2;
  const wTop = W * .24, wBot = W * 2.5;         /* top / bottom edge widths */

  const w = []; let wsum = 0;
  for (let i = 0; i < ranks; i++) { w.push(Math.pow(growth, i)); wsum += w[i]; }
  const ys = [hy]; let acc = hy;
  for (let i = 0; i < ranks; i++) { acc += span * w[i] / wsum; ys.push(acc); }
  const fr = ys.map(y => (y - hy) / span);
  const Ls = fr.map(f => cx - (wTop + (wBot - wTop) * f) / 2);
  const Rs = fr.map(f => cx + (wTop + (wBot - wTop) * f) / 2);

  for (let i = 0; i < ranks; i++) {
    for (let j = 0; j < files; j++) {
      const x1 = Ls[i]   + (Rs[i]   - Ls[i])   * j       / files;
      const x2 = Ls[i]   + (Rs[i]   - Ls[i])   * (j + 1) / files;
      const X1 = Ls[i+1] + (Rs[i+1] - Ls[i+1]) * j       / files;
      const X2 = Ls[i+1] + (Rs[i+1] - Ls[i+1]) * (j + 1) / files;
      el("polygon", { points:
        x1.toFixed(1) + "," + ys[i].toFixed(1) + " " + x2.toFixed(1) + "," + ys[i].toFixed(1) + " " +
        X2.toFixed(1) + "," + ys[i+1].toFixed(1) + " " + X1.toFixed(1) + "," + ys[i+1].toFixed(1),
        fill: ((i + j) % 2) ? "#4A3A26" : "#0E0A07" });
    }
  }
  const grid = { fill: "none", stroke: "#D4B07A", "stroke-opacity": ".25",
    "stroke-width": "1", "vector-effect": "non-scaling-stroke" };
  for (let j = 0; j <= files; j++) {
    el("polyline", Object.assign({ points: ys.map((y, i) =>
      (Ls[i] + (Rs[i] - Ls[i]) * j / files).toFixed(1) + "," + y.toFixed(1)).join(" ") }, grid));
  }
  for (let i = 0; i <= ranks; i++) {
    el("line", Object.assign({ x1: Ls[i].toFixed(1), y1: ys[i].toFixed(1),
      x2: Rs[i].toFixed(1), y2: ys[i].toFixed(1) }, grid));
  }
  const rim = (in0, inB, dy0, dyB) =>
    (Ls[0] + in0).toFixed(1) + "," + (ys[0] + dy0).toFixed(1) + " " +
    (Rs[0] - in0).toFixed(1) + "," + (ys[0] + dy0).toFixed(1) + " " +
    (Rs[ranks] - inB).toFixed(1) + "," + (ys[ranks] - dyB).toFixed(1) + " " +
    (Ls[ranks] + inB).toFixed(1) + "," + (ys[ranks] - dyB).toFixed(1);
  el("polygon", { points: rim(0, 0, 0, 0), fill: "none", stroke: "#D4B07A",
    "stroke-opacity": ".6", "stroke-width": "2.5", "vector-effect": "non-scaling-stroke" });
  el("polygon", { points: rim(10, 26, 6, 14), fill: "none", stroke: "#D4B07A",
    "stroke-opacity": ".3", "stroke-width": "1", "vector-effect": "non-scaling-stroke" });

  const defs = document.createElementNS(NS, "defs");
  defs.innerHTML =
    '<linearGradient id="bpFade" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0F0D0D"/>' +
      '<stop offset=".55" stop-color="#0F0D0D" stop-opacity=".85"/>' +
      '<stop offset="1" stop-color="#0F0D0D" stop-opacity="0"/>' +
    '</linearGradient>' +
    '<linearGradient id="bpHalo" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#D4B07A" stop-opacity=".12"/>' +
      '<stop offset="1" stop-color="#D4B07A" stop-opacity="0"/>' +
    '</linearGradient>' +
    '<linearGradient id="bpSheen" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#F2EFE8" stop-opacity="0"/>' +
      '<stop offset=".5" stop-color="#F2EFE8" stop-opacity=".05"/>' +
      '<stop offset="1" stop-color="#F2EFE8" stop-opacity="0"/>' +
    '</linearGradient>';
  boardsvg.appendChild(defs);
  el("rect", { x: 0, y: hy, width: W, height: Math.round(H * .06), fill: "url(#bpHalo)" });
  el("rect", { x: -Math.round(W * .1), y: Math.round(H * .55), width: Math.round(W * 1.2),
    height: Math.round(H * .14), fill: "url(#bpSheen)",
    transform: "rotate(-8 " + (W / 2) + " " + Math.round(H * .62) + ")" });
  el("rect", { x: -Math.round(W * .1), y: Math.round(H * .78), width: Math.round(W * 1.2),
    height: Math.round(H * .07), fill: "url(#bpSheen)",
    transform: "rotate(-8 " + (W / 2) + " " + Math.round(H * .82) + ")" });

  let k = 0; while (k < ranks && (ys[k + 1] - hy) / span < .22) k++;
  el("polygon", { points:
    Ls[0].toFixed(1) + "," + ys[0].toFixed(1) + " " + Rs[0].toFixed(1) + "," + ys[0].toFixed(1) + " " +
    Rs[k].toFixed(1) + "," + ys[k].toFixed(1) + " " + Ls[k].toFixed(1) + "," + ys[k].toFixed(1),
    fill: "url(#bpFade)" });
}
buildBoardPlane();
let bpT = 0;
addEventListener("resize", () => { clearTimeout(bpT); bpT = setTimeout(buildBoardPlane, 150); });

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
      b.setAttribute("aria-label", name + ", " +
        (blocks && blocks[c] && blocks[c].block_label ? blocks[c].block_label : V.blocks[c]) +
        " ET, " + state + (k === "n" ? " — tap for why" : " — tap for evidence"));
      b.innerHTML = '<span class="tm" aria-hidden="true">' + V.times[c] + '</span>' +
        '<span class="g" aria-hidden="true">' + ICONS[k] + '</span>' +
        '<span class="lb" aria-hidden="true">' + LABELS[k] + '</span>';
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

/* evidence — opens on tap, every number observed/estimated with its n */
function showEvidence(name, col) {
  const rec = cells[name + ":" + col];
  if (!rec) return;
  Object.values(cells).forEach((r) => r.btn.classList.remove("sel"));
  rec.btn.classList.add("sel");
  const c = rec.cell, blk = rec.block;
  const bl = blk && blk.block_label ? blk.block_label : VIEWS[view].blocks[col];
  const k = c ? stateKey(c.state) : "n";
  let h = '<div class="evidence__head">' +
    '<span class="evidence__name">' + esc(name) + '</span>' +
    '<span class="evidence__block">' + esc(bl) + ' ET</span>' +
    '<span class="state state--' + k + '">' + (c ? esc(c.state) : "NO DATA") + '</span></div>';
  if (c) {
    h += legLine("perp", c.perp) + legLine("spot", c.spot);
    h += tapeLine(c.freshness);
    h += coverLine(c.coverage);
    if (c.reasons && c.reasons.length)
      h += '<div class="ev" style="font-family:var(--sans);color:rgba(242,239,232,.68)">why: <span class="mono">' +
        c.reasons.map(esc).join(" · ") + '</span>' +
        (c.labels ? '<br>' + esc(c.labels) : '') + '</div>';
    if (current && current.fees_rt_bp)
      h += '<div class="evidence__rule">all-in = book walk + fees (perp ' +
        current.fees_rt_bp.perp + ' bp · spot ' + current.fees_rt_bp.spot +
        ' bp round trip) · thresholds pre-registered · execution quality, never direction</div>';
  } else {
    h += '<div class="ev" style="font-family:var(--sans);color:rgba(242,239,232,.68)">' +
      'No data for this block yet — nothing is shown and nothing is invented. ' +
      'The square fills only when the recorder captured it (>=30 snapshots per ' +
      'market and a book within ±120 s).</div>';
  }
  ev.classList.add("open");
  ev.innerHTML = h;
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
    verdictValue.textContent = String(s.a);
    verdictSub.textContent = "ACTIONABLE hours · " + s.t + " THIN · " + s.d +
      " DARK · " + s.n + " NO DATA — execution quality only, never direction";
  } else {
    verdictValue.textContent = "—";
    verdictSub.textContent = "verdicts appear only from recorded data";
  }
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

/* ══════════ B · SCROLL = A GAME — transform/opacity ONLY ══════════
   hero->board: the NEAR knight hops an L.  board->how: the MID bishop slides
   a diagonal.  how->honesty: the NEAR rook slides straight and captures the
   MID pawn — it fades, dims and falls. */
const stage     = document.getElementById("stage");
const layerFar  = document.getElementById("layerFar");
const layerMid  = document.getElementById("layerMid");
const layerNear = document.getElementById("layerNear");
const mvKnight  = document.getElementById("mv-knight");
const mvBishop  = document.getElementById("mv-bishop");
const mvRook    = document.getElementById("mv-rook");
const mvPawn    = document.getElementById("mv-pawn");
const sections = ["hero", "board", "how", "honesty"].map((id) => document.getElementById(id));
let tops = [];
const measure = () => { tops = sections.map((s) => s.offsetTop); };
measure(); addEventListener("resize", measure);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ease = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const prog = (sy, top, vh) => clamp01((sy + vh - top) / (vh * 0.95));

/* desktop-only mouse parallax (translate only) */
const finePointer = matchMedia("(pointer: fine)").matches;
let mxT = 0, myT = 0, mx = 0, my = 0;
if (finePointer && !rm) {
  addEventListener("pointermove", (e) => {
    mxT = e.clientX / innerWidth - .5;
    myT = e.clientY / innerHeight - .5;
    requestApply();
  }, { passive: true });
}

let ticking = false;
function requestApply() {
  if (!ticking) { ticking = true; requestAnimationFrame(apply); }
}
function apply() {
  ticking = false;
  const sy = scrollY, vh = innerHeight, iw = innerWidth;
  mx += (mxT - mx) * .12;  my += (myT - my) * .12;

  layerFar.style.transform  = "translate(" + (-mx * 4).toFixed(1) + "px," + (sy * .05 - my * 3).toFixed(1) + "px)";
  layerMid.style.transform  = "translate(" + (-mx * 8).toFixed(1) + "px," + (sy * .11 - my * 5).toFixed(1) + "px)";
  layerNear.style.transform = "translate(" + (-mx * 16).toFixed(1) + "px," + (sy * .24 - my * 9).toFixed(1) + "px)";

  const kd = clamp01(sy / (vh * 0.9));
  stage.style.opacity = (1 - 0.88 * kd).toFixed(3);
  stage.style.transform =
    "translateX(-50%) translate(" + (mx * 10).toFixed(1) + "px," + (sy * .22 + my * 6).toFixed(1) + "px)";

  const p1 = prog(sy, tops[1], vh);
  const kx = ease(clamp01(p1 * 1.75)) * iw * 0.20;
  const ky = ease(clamp01((p1 - .5) * 2)) * (-vh * 0.13)
           - 46 * Math.sin(Math.PI * p1);
  mvKnight.style.transform = "translate(" + kx.toFixed(1) + "px," + ky.toFixed(1) + "px)";

  const p2 = ease(prog(sy, tops[2], vh));
  mvBishop.style.transform = "translate(" + (p2 * iw * .09).toFixed(1) + "px," + (-p2 * vh * .12).toFixed(1) + "px)";

  const p3 = prog(sy, tops[3], vh);
  mvRook.style.transform = "translate(0px," + (ease(p3) * vh * .38).toFixed(1) + "px)";
  const cp = ease(clamp01((p3 - .5) / .5));
  mvPawn.style.opacity = (1 - .8 * cp).toFixed(3);
  mvPawn.style.transform = "rotate(" + (76 * cp).toFixed(1) + "deg) translateY(" + (10 * cp).toFixed(1) + "px)";
}
if (!rm) {
  addEventListener("scroll", requestApply, { passive: true });
  apply();
}
})();
