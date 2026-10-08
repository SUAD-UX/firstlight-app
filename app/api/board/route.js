// ============================================================================
// Firstlight — /api/board?size=1000&view=last_night|weekend
//
// The board is a REAL product: every square comes from the Supabase recorder
// via the engine. There is no demo data and no demo fallback. If the live
// read fails (env missing, Supabase unreachable, fetch error) the response is
// mode:"error" with an all-NO-DATA board and the reason in `note` — never
// invented values.
//
//   view "last_night" (default) — most recent completed weekday night,
//        8 hourly blocks 20:00→04:00 ET
//   view "weekend" — current weekend as it fills in, else the most recent
//        completed one; 8 blocks × 7 h from Fri 20:00 ET
//
// The service key lives only in Vercel env vars — never in code, the repo,
// or responses. `recorded` = age of the newest recorder write ("recorded
// N h ago" stamp).
// ============================================================================

import { NextResponse } from "next/server";
import { buildSessionBoard, resolveSession, noDataCell } from "../../../lib/supabase.js";
import { NAMES, THRESHOLDS, TAKER_FEE_BP } from "../../../lib/engine.js";

export const dynamic = "force-dynamic"; // never cache boards

export async function GET(request) {
  const sp = new URL(request.url).searchParams;
  let size = parseInt(sp.get("size") || "1000", 10);
  if (!Number.isFinite(size)) size = 1000;
  size = Math.min(Math.max(Math.round(size), 100), 100000);
  const view = sp.get("view") === "weekend" ? "weekend" : "last_night";

  try {
    const board = await buildSessionBoard(size, { view });
    return NextResponse.json(board);
  } catch (e) {
    const msg = String(e?.message || e);
    const session = resolveSession(view); // pure ET math — works without env
    return NextResponse.json({
      schema_version: "1.4.0",
      mode: "error",
      view,
      size_usd: size,
      size_label: "$" + size.toLocaleString("en-US"),
      session: {
        label: session.label,
        start_utc: session.startUtc.toISOString(),
        end_utc: session.endUtc.toISOString(),
        in_progress: session.inProgress,
      },
      recorded: null,
      names: [...NAMES],
      blocks: session.blocks.map((b) => ({
        block_id: b.id,
        block_label: b.label,
        start_utc: b.startUtc.toISOString(),
        end_utc: b.endUtc.toISOString(),
        eval_utc: null,
        complete: b.complete,
        cells: NAMES.map((n) => noDataCell(n, ["live_read_unavailable"])),
      })),
      thresholds: { ...THRESHOLDS },
      fees_rt_bp: { spot: 2 * TAKER_FEE_BP.spot, perp: 2 * TAKER_FEE_BP.perp },
      generated_utc: new Date().toISOString(),
      disclaimer: "Overnight execution evidence only — costs, depth and tape " +
        "freshness at your size. Not a prediction, not advice.",
      note: `live read unavailable (${msg.slice(0, 140)})`,
    });
  }
}
