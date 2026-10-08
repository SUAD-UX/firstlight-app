// ============================================================================
// Firstlight — lib/why.js · the Why-chat explainer (Part D).
//
// The LLM explains ONE tapped square in plain words, using ONLY the engine's
// numbers for that square. This module is the integrity backbone:
//
//   · evidenceSummary()  — extracts the square's evidence object from a board
//                          response (the ONLY input any explanation may use)
//   · systemPrompt()     — the strict prompt the model runs under
//   · narrateTemplate()  — the deterministic narrator used when no LLM key
//                          is configured or the model call fails: same rules,
//                          zero hallucination surface, always available
//
// Rules everywhere: missing values are said out loud as "no data"; every
// figure keeps its sample size; execution quality only — never direction,
// never buy/sell language, never a prediction. The verdict itself is always
// computed by the deterministic engine, never by the LLM.
// ============================================================================

/** The compact evidence object for one square. Returns null when the square
 *  does not exist in the board (bad name/block index or no data at all). */
export function evidenceSummary(board, name, blockIndex) {
  const blk = board && Array.isArray(board.blocks) ? board.blocks[blockIndex] : null;
  const cell = blk && Array.isArray(blk.cells)
    ? blk.cells.find((c) => c && c.name === name) : null;
  if (!cell) return null;
  return {
    schema: "firstlight.why.v1",
    name: cell.name,
    state: cell.state,
    block: blk.block_label,
    view: board.view,
    trade_size: board.size_label,
    perp_leg: cell.perp,
    spot_leg: cell.spot,
    freshness: cell.freshness,
    coverage: cell.coverage,
    engine_reasons: cell.reasons,
    fills_recorded_in_block: (blk.fills && blk.fills[cell.name]) || null,
    tape_page_capped: (board.tape_capped && board.tape_capped[cell.name]) || null,
    thresholds: board.thresholds,
    fees_round_trip_bp: board.fees_rt_bp,
    labels: cell.labels,
  };
}

/** The system prompt for the model call. Same guardrails as the template. */
export function systemPrompt() {
  return [
    "You are the explainer inside Firstlight, an overnight execution-evidence",
    "desk for tokenized stocks and perpetuals on Bitget. You receive ONE JSON",
    "evidence object for a single square: one stock, one hour of the night, one",
    "trade size. Explain it in plain words for a trader reading on a phone.",
    "",
    "HARD RULES:",
    "1. Use ONLY figures present in the JSON. Never compute new figures, never",
    "   re-round, never invent. If a number is not there, it does not exist.",
    "2. Quote every figure together with its sample size exactly as given",
    "   (n books, n fills, n snapshots).",
    "3. If a value is missing, unobserved or false, say \"no data\" — never",
    "   guess, never smooth over a gap.",
    "4. Execution quality only: cost, depth, tape freshness, coverage.",
    "   NEVER direction, NEVER buy or sell language, NEVER price predictions.",
    "5. The state (ACTIONABLE / THIN / DARK / NO DATA) was computed by a",
    "   deterministic engine with pre-registered thresholds — explain it, do",
    "   not re-judge it, and flag thin evidence explicitly.",
    "6. Maximum 120 words. Plain sentences, no headings, no lists, no emoji.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// deterministic narrator — the always-available fallback
// ---------------------------------------------------------------------------

function legText(label, leg, feesRt) {
  if (!leg || !leg.observed)
    return label + " cost: no data (no usable book within ±120 s of the hour)";
  if (leg.complete === false)
    return label + " cost: no data — the recorded book ran out before filling the size";
  if (leg.rt_bp == null) return label + " cost: no data";
  let t = label + " all-in round-trip cost " + leg.rt_bp.toFixed(1) +
    " bp (n=" + leg.n_books + " book" + (leg.n_books === 1 ? "" : "s") +
    ", book age " + leg.book_age_s.toFixed(1) + " s, " +
    leg.levels_buy + "×" + leg.levels_sell + " depth levels, incl. " +
    feesRt + " bp fees)";
  return t;
}

function tapeText(f) {
  if (!f) return "tape: no data";
  const one = (venue, x) => venue + " tape " + (x && x.observed
    ? x.age_min.toFixed(1) + " min old (n=" + x.n_fills + " fills" +
      (x.n_fills >= 1000 ? ", page-capped count" : "") + ")"
    : "no data (no fills on the recorded tape)");
  return one("spot", f.spot) + "; " + one("perp", f.perp);
}

const STATE_SENTENCE = {
  ACTIONABLE: "The engine calls this hour ACTIONABLE: at this size, both venues were cheap enough and the tapes were fresh enough to act on.",
  THIN: "The engine calls this hour THIN: the evidence is real but not strong enough to call it actionable — treat it with care.",
  DARK: "The engine calls this hour DARK: at this size, the venue it measures was too expensive, too shallow, or its tape too stale to act on.",
  "NO DATA": "The engine has NO DATA for this hour: the recorder did not capture enough, and nothing is estimated from thin coverage.",
};

/** Deterministic plain-words narration of one evidence summary. */
export function narrateTemplate(ev) {
  if (!ev) return "no data — this square has no evidence yet.";
  const T = ev.thresholds || {};
  const out = [];
  out.push((STATE_SENTENCE[ev.state] || "The engine's state for this hour is " + ev.state + ".") +
    " " + ev.block + ", " + ev.trade_size + ".");
  if (ev.state === "NO DATA") {
    out.push("A square needs at least " + (T.min_snapshots_per_block || 30) +
      " snapshots per market in its hour and a book within ±120 s — otherwise it stays NO DATA and nothing is shown.");
  } else {
    out.push(legText("perp", ev.perp_leg, (ev.fees_round_trip_bp && ev.fees_round_trip_bp.perp) || 12) + ".");
    out.push(legText("rToken spot", ev.spot_leg, (ev.fees_round_trip_bp && ev.fees_round_trip_bp.spot) || 20) + ".");
    out.push(tapeText(ev.freshness) + ".");
    if (ev.coverage) {
      out.push("Coverage " + ev.coverage.n + "/" + ev.coverage.required +
        " snapshots per market" + (ev.coverage.ok ? "" : " — under the pre-registered minimum") + ".");
    }
    if (ev.fills_recorded_in_block) {
      out.push("Fills recorded inside this hour: perp " +
        ev.fills_recorded_in_block.perp + " · spot " + ev.fills_recorded_in_block.spot +
        (ev.tape_page_capped && (ev.tape_page_capped.perp || ev.tape_page_capped.spot)
          ? " (busy tapes are page-capped at the newest 1,000 prints, so counts can understate)"
          : "") + ".");
    }
  }
  out.push("Execution quality only — cost, depth, freshness. Not direction, not advice.");
  return out.join(" ");
}

/** Footer shown under every Why answer, whichever source produced it. */
export const WHY_FOOTER = "Figures come only from the engine's evidence object for this square; missing values are reported as no data. Firstlight shows execution quality, never direction.";
