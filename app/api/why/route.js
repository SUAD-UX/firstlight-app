// ============================================================================
// Firstlight — /api/why?name=NVDA&block=6&size=1000&view=last_night
//
// Why-chat (Part D): explains ONE tapped square in plain words, using ONLY
// the engine's numbers for that square. The board is REBUILT from Supabase
// on every call, so the explanation can never be fed invented figures by
// the client — the route only accepts which square, never any numbers.
//
// Source of the text, in order:
//   1. an LLM (any OpenAI-compatible endpoint) under lib/why.js's strict
//      system prompt — active only when WHY_API_KEY is set in Vercel env
//   2. the built-in deterministic narrator (lib/why.js narrateTemplate) —
//      always available, same rules, zero hallucination surface
//
// Either way: "no data" for missing values, every figure keeps its n,
// execution quality only — never direction, never buy/sell language.
// The verdict itself is always computed by the deterministic engine.
// ============================================================================

import { NextResponse } from "next/server";
import { buildSessionBoard } from "../../../lib/supabase.js";
import { NAMES } from "../../../lib/engine.js";
import { evidenceSummary, narrateTemplate, systemPrompt, WHY_FOOTER } from "../../../lib/why.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  const name = String(sp.get("name") || "").toUpperCase().slice(0, 8);
  const block = parseInt(sp.get("block") || "0", 10);
  let size = parseInt(sp.get("size") || "1000", 10);
  if (!Number.isFinite(size)) size = 1000;
  size = Math.min(Math.max(Math.round(size), 100), 100000);
  const view = sp.get("view") === "weekend" ? "weekend" : "last_night";

  const bad = (text) => NextResponse.json(
    { source: "none", text, footer: WHY_FOOTER },
    { status: 200 });

  if (!NAMES.includes(name) || !Number.isInteger(block) || block < 0 || block > 7) {
    return bad("no data — unknown square.");
  }

  let board = null;
  try {
    board = await buildSessionBoard(size, { view });
  } catch (e) {
    return bad("no data — the live recorder read is unavailable right now, so there is nothing to explain. Nothing is invented.");
  }

  const ev = evidenceSummary(board, name, block);
  if (!ev) {
    return bad("no data — this square has no evidence yet.");
  }

  // 1 · the model, when a key is configured
  const key = process.env.WHY_API_KEY;
  if (key) {
    try {
      const url = process.env.WHY_API_URL ||
        "https://api.openai.com/v1/chat/completions";
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + key,
        },
        body: JSON.stringify({
          model: process.env.WHY_MODEL || "gpt-4o-mini",
          temperature: 0,
          max_tokens: 220,
          messages: [
            { role: "system", content: systemPrompt() },
            { role: "user", content: JSON.stringify(ev) },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      });
      const j = await r.json();
      let text = j && j.choices && j.choices[0] &&
        j.choices[0].message && String(j.choices[0].message.content || "").trim();
      if (text) {
        if (text.length > 700) text = text.slice(0, 700).trimEnd() + "…";
        return NextResponse.json({ source: "model", text, footer: WHY_FOOTER });
      }
    } catch (e) {
      // fall through to the deterministic narrator — never fail the panel
    }
  }

  // 2 · the built-in narrator (always available)
  return NextResponse.json({ source: "template", text: narrateTemplate(ev), footer: WHY_FOOTER });
}
