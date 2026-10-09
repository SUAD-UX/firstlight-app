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
export const maxDuration = 30;

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
  const key = String(process.env.WHY_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  let reason = key ? "" : "WHY_API_KEY not set in this deployment";
  if (key) {
    let url = String(process.env.WHY_API_URL || "https://api.openai.com/v1/chat/completions").trim();
    if (!/\/chat\/completions\/?$/.test(url)) url = url.replace(/\/+$/, "") + "/chat/completions";
    const isGroq = url.includes("groq.com");
    // Groq retired llama-3.3-70b-versatile on free accounts (Aug 2026) — if the configured
    // model is gone (404), fall through to current production models instead of failing.
    const wanted = String(process.env.WHY_MODEL || "").trim();
    const models = [wanted || (isGroq ? "openai/gpt-oss-120b" : "gpt-4o-mini")];
    if (isGroq) for (const m of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) if (!models.includes(m)) models.push(m);
    for (const model of models) {
      try {
        const reasoning = /gpt-oss/.test(model);
        const r = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + key },
          body: JSON.stringify({
            model,
            temperature: 0,
            // reasoning models spend completion tokens thinking — leave room for the answer
            max_tokens: reasoning ? 900 : 260,
            ...(reasoning ? { reasoning_effort: "low" } : {}),
            messages: [
              { role: "system", content: systemPrompt() },
              { role: "user", content: JSON.stringify(ev) },
            ],
          }),
          signal: AbortSignal.timeout(9000),
        });
        const raw = await r.text();
        let j = null; try { j = JSON.parse(raw); } catch (e) {}
        let text = j && j.choices && j.choices[0] &&
          j.choices[0].message && String(j.choices[0].message.content || "").trim();
        if (text) {
          if (text.length > 900) text = text.slice(0, 900).trimEnd() + "…";
          return NextResponse.json({ source: "model", model, text, footer: WHY_FOOTER });
        }
        reason = "provider HTTP " + r.status + " · model " + model + " · " +
          ((j && j.error && (j.error.message || j.error)) || raw || "empty reply").toString().slice(0, 200);
        if (r.status !== 404 && r.status !== 400) break;   // key/rate/server problems: don't hammer other models
      } catch (e) {
        reason = "call failed: " + String(e && e.message || e).slice(0, 160);
        break;
      }
    }
  }
  const debug = new URL(request.url).searchParams.get("debug") === "1";

  // 2 · the built-in narrator (always available)
  return NextResponse.json({ source: "template", text: narrateTemplate(ev), footer: WHY_FOOTER, ...(debug ? { reason } : {}) });
}
