// ============================================================================
// Firstlight — the overnight board (the approved rev4 UI: pieces on a crisp
// chessboard, thick glass panes, chess-clock reveal).
//
// This page is a thin SERVER shell: the static markup is one template string
// in lib/shell.js (the same markup as the approved mock), and ALL behaviour
// lives in /ui.js (public/ui.js), which fetches /api/board?size=…&view=…
// and fills every square with REAL recorder data. There is no demo data
// anywhere: unavailable data renders as NO DATA, never invented values.
//
// Plain JS, no JSX — `node --check app/page.js` verifies it.
import { createElement } from "react";
import { SHELL } from "../lib/shell.js";

export default function Home() {
  return createElement("div", {
    id: "fl",
    dangerouslySetInnerHTML: { __html: SHELL },
  });
}
