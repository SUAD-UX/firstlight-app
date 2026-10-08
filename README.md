# Firstlight — the overnight execution board (rev7 UI, wired to /api/board)

A Next.js app that serves the overnight board at
**`/api/board?size=1000&view=last_night`**. The page: a **photoreal
strategy-room scene** (`public/bg/board-desktop.jpg`, with a 9:16 phone
version) fixed behind everything — dark walnut table, chessboard, warm
lamp light, matte, no text in the image — with a dark scrim on top so
every label keeps 4.5:1 contrast, and the glass UI floating above it:
glass nav pill, glass panels, and **the board as a grid of translucent
glass cards**, one per hour per instrument. Each card shows, from your
recorder: the ticker (NVDA/TSLA/AAPL/MSFT/SPY), the latest perp price
(`px`, last 1-minute close from `candles_1m`), that block's all-in cost
in bp, a tiny gold/ivory line of the block's per-minute closes
(`closes[]`, max 60 points, plain SVG), and the verdict icon + label.
Missing data shows "no data". **No demo data and no demo fallback
anywhere:** if the live read fails the response is `mode:"error"` with
an all-NO-DATA board and the reason in `note`; values are never
invented. No red/green anywhere — direction reads through gold vs ivory
and typography only, no arrows. On the phone the cards stack 4-across
(4×2 per screen) with the same fields. Tap any card for its evidence.
A fixed **ticker row** sits directly under the nav. If the background
photo fails to load, it hides itself and a dark walnut gradient shows —
never a broken image. Phone keeps at most 3 blur layers; blur is never
animated.

- **`view=last_night` (default)** — the most recent *completed* weekday
  night (Mon–Thu 20:00 → next day 04:00 ET), 8 hourly blocks.
- **`view=weekend`** — the weekend session in progress (blocks fill in with
  real recordings as their hours complete), else the most recent completed
  one; 8 blocks × 7 h from Fri 20:00 ET.
- **`size=1000|5000|25000`** — your trade size; every cost figure is the
  all-in round-trip at that size (book walk + fees).
- A block/hour with **fewer than 30 snapshots per market stays NO DATA**
  (engine pre-registration) and estimates nothing.
- `recorded` = age of the newest recorder write → the "recorded N h ago"
  stamp. The badge reads **LIVE – RECORDED** only while numbers genuinely
  come from Supabase.

**Link previews** are wired too: the page ships Open Graph + X-card
metadata (`app/layout.js`) and a 1200×630 share image (`app/opengraph-image.png`,
copied to `app/twitter-image.png`) built on the *same* crisp candlestick
scene as the page background, with the words drawn in code so the spelling
is exact: **Firstlight** (ivory + gold serif), a thin gold rule, tagline
**"Is it executable tonight?"**, small line **NVDA · TSLA · AAPL · MSFT ·
SPY**. The image deliberately shows **no data** (no prices, no percentages,
no +/− numbers, no red/green, no arrows) because it is cached for days —
text contrast is 16:1+ and the PNG is under 600 KB. `app/icon.png` (512×512,
the knight with the Firstlight wordmark, readable at 32px) is the favicon.

The candlestick atmosphere lives entirely **in the photo itself** — no
code-drawn chart layer (the earlier `bg__holo` SVG was removed: it read
faint and blurry behind the glass). The scrim is **asymmetric**: it
darkens the left (hero side) strongly and fades toward the right so the
candles read clearly behind the board, plus a light top/bottom vignette.

How the page is built (plain JS everywhere, `node --check` verifies every
file): `app/page.js` renders the static markup from `lib/shell.js` (one
template string), `app/globals.css` is the full stylesheet, and
**`public/ui.js` does everything else in the browser**: fetches
`/api/board`, renders the 40 real glass cards (ticker · px · closes line ·
bp · verdict, via the pure `closesPath` helper), the hero numbers (all-in
cost / tape age / verdict — observed values only), the badge + stamp, the
tap-to-open evidence (every figure observed/estimated with its n), the
$1,000/$5,000/$25,000 selector, the views, the ticker row and the
chess-clock card reveal. The background photos live in `public/bg/`
(desktop + 9:16 mobile, each under 400 KB, no text/numbers in them); the
scrim + glass panes sit above the photo, cards never contain imagery.

---

## Part 1 — Put the code on GitHub (phone-friendly, ~15 min)

You create 18 files (13 text + 5 images). On a phone the reliable way is
GitHub's **Create new file** — typing a path with slashes creates the
folders automatically. For the three PNGs use **Add file → Upload files**
instead (select them from `firstlight/app/app/` in this workspace).

1. Go to <https://github.com> and sign in.
2. Tap **+** (top right) → **New repository**.
3. Repository name: `firstlight-app` → **Create repository**.
4. On the empty-repo page tap **Add file → Create new file**.
5. For EACH text row below: type the exact **path** into the name box
   (slashes create folders), open the matching file from `firstlight/app/`
   in this workspace, select-all, copy, paste it in, then tap **Commit
   changes**. Then upload the three PNGs the same way (their paths contain
   no folders to create — `app/opengraph-image.png` etc.):

| # | path (type exactly) | source file |
|---|---|---|
| 1 | `package.json` | `firstlight/app/package.json` |
| 2 | `.gitignore` | `firstlight/app/.gitignore` |
| 3 | `.env.example` | `firstlight/app/.env.example` |
| 4 | `lib/engine.js` | `firstlight/app/lib/engine.js` |
| 5 | `lib/supabase.js` | `firstlight/app/lib/supabase.js` |
| 6 | `lib/shell.js` | `firstlight/app/lib/shell.js` |
| 7 | `lib/why.js` | `firstlight/app/lib/why.js` |
| 8 | `app/layout.js` | `firstlight/app/app/layout.js` |
| 9 | `app/globals.css` | `firstlight/app/app/globals.css` |
| 10 | `app/page.js` | `firstlight/app/app/page.js` |
| 11 | `app/api/board/route.js` | `firstlight/app/app/api/board/route.js` |
| 12 | `app/api/why/route.js` | `firstlight/app/app/api/why/route.js` |
| 13 | `public/ui.js` | `firstlight/app/public/ui.js` |
| 14 | `public/bg/board-desktop.jpg` | `firstlight/app/public/bg/board-desktop.jpg` *(upload)* |
| 15 | `public/bg/board-mobile.jpg` | `firstlight/app/public/bg/board-mobile.jpg` *(upload)* |
| 16 | `app/opengraph-image.png` | `firstlight/app/app/opengraph-image.png` *(upload)* |
| 17 | `app/twitter-image.png` | `firstlight/app/app/twitter-image.png` *(upload)* |
| 18 | `app/icon.png` | `firstlight/app/app/icon.png` *(upload)* |

The `test/` folder is **not** needed on GitHub — it's local verification
(engine port vs the Python reference, plus the UI pure-function harness).

6. Commit message defaults are fine. You now have a repo named
   `firstlight-app` with these files at the top level.

## Part 2 — Deploy to Vercel (~5 min)

1. Go to <https://vercel.com> → **Continue with GitHub** (same account).
2. **Add New… → Project**.
3. Find `firstlight-app` in the list → **Import**. (If it's not there:
   Vercel → Settings → Git → adjust the GitHub App to allow the repo.)
4. Leave every build setting as-is (framework auto-detects Next.js).
5. **Before deploying, add the environment variables** — open
   **Environment Variables** and add TWO:

   | Name | Value (where to get it) |
   |---|---|
   | `SUPABASE_URL` | Supabase dashboard → **Project Settings → API** → **Project URL** (`https://xxxx.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → **Project Settings → API Keys** → reveal the **`service_role`** key → copy |

   ⚠ The service key is used **server-side only** — the API route never
   sends it to browsers, and you never commit it to GitHub (that's why
   there is no `.env` file in the repo, only `.env.example`).

   Optional but recommended — a third variable so link previews point at
   the right absolute URL:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | your final URL, e.g. `https://firstlight-app.vercel.app` |

   (If Vercel names your project `firstlight-app` this matches the default
   already built into `app/layout.js` — but if your URL differs, set it,
   because it is inlined at build time: changing it later requires a
   **Redeploy**.)

6. Tap **Deploy** and wait ~1–2 minutes.
7. Open your Vercel URL:
   - `https://your-app.vercel.app/` — **the board page** (the rev4 UI)
   - `https://your-app.vercel.app/api/board?size=1000` — last night's
     board as JSON (also try `?size=5000`, `?size=25000`, any number
     100–100000; `?view=weekend` for the weekend board)

## What you should see

- **The page**: a crisp perspective chessboard behind everything, the king
  on his plinth with the thin gold halo, sharp mid pieces, thick glass
  panes. As you scroll: the knight hops, the bishop slides, the rook
  captures the pawn. The board grid lights in one at a time, chess-clock
  style, when it scrolls into view (ACTIONABLE squares glow last).
- **Hero numbers** (left pane, filled from the API): median perp all-in
  round-trip across observed squares at your size, the recorder heartbeat
  age, and the ACTIONABLE/THIN/DARK/NO DATA counts — observed values only,
  never estimated.
- **Badge + stamp**: `LIVE – RECORDED` (gold) only when the numbers come
  from Supabase; `recorded · 14 h ago` is the age of the freshest recorder
  write. If the read fails: `no data — live read unavailable`, every
  square dashed NO DATA, reason in the note.
- **Tap any square** → the mini trading panel: a gauge of the perp all-in
  cost against its 15 bp pre-registered limit (gold mark at the limit),
  four stat tiles (perp cost, spot cost, tape age, coverage vs 30), a
  perp-vs-spot split bar, key/value rows (book ages, depth levels, fills
  in the hour with n, fees), the reason in plain words plus the machine
  codes, a line chart of all-in cost across the night, and activity bars
  of fills per hour perp vs spot — a silent spot tape is visible at a
  glance. Verdicts differ by shape, icon and label as well as tone; gold,
  cream and bronze only — no red, no green, ever.
- **Open on Bitget** (in the panel): appears only when the evidence
  supports a venue (perp within 15 bp, or spot within 35 bp with verified
  tape) and links to the real market page
  (`…/futures/usdt/NVDAUSDT` / `…/spot/RNVDAUSDT` — patterns verified
  live). No keys, no order placement — you confirm and trade on Bitget.
- **Why this square?** (in the panel): a plain-words explanation from
  that square's evidence object only — missing values are said as
  "no data", never a guess, never buy/sell language. Served by
  `/api/why`, which rebuilds the board server-side (the client can never
  inject figures); uses the LLM when `WHY_API_KEY` is set, else the
  built-in deterministic narrator.
- **Ticker strip** under the top bar: one chip per name — latest
  completed hour's verdict + perp cost. No prices, no up/down arrows.
- **State light** (hero): switches to `LIVE – RECORDED` when the board
  lands; honest `NO DATA · LIVE READ UNAVAILABLE` on failure. The gold
  line on the board floor is the night's real cost curve — drawn only
  from recorded data, never otherwise.
- **`mode: "live"`** in the JSON once the env vars are set; `mode:
  "error"` (all cells NO DATA + `note`) when the live read fails — usually
  the two env vars aren't set yet or Supabase is unreachable. Nothing is
  ever invented.
- A freshly recorded night needs each hour to have ≥30 snapshots per
  market — with the v0.4 staggered cadence that's ~60 minutes of the hour
  being captured.

## Troubleshooting

| symptom | fix |
|---|---|
| build fails on Vercel | check `package.json` was pasted exactly (typo → npm install fails) |
| page renders but no styles / no interactivity | `app/globals.css` or `public/ui.js` missing or misnamed — the paths must be exactly as in the table above |
| link preview shows no image | the three PNGs must be at `app/opengraph-image.png`, `app/twitter-image.png`, `app/icon.png` (Next file conventions); check `view-source:` for `<meta property="og:image">`; if the URL is wrong, set `NEXT_PUBLIC_SITE_URL` and **Redeploy** |
| X still shows an old preview | X caches cards hard — retest at <https://cards-dev.twitter.com/validator> (or opengraph.xyz) after a redeploy; the image itself is served with long cache headers by design |
| `/api/board` note says "missing env" | the two env variables aren't set or are misnamed — Vercel → Project → Settings → Environment Variables; then **Redeploy** |
| badge says "no data — live read unavailable" but env is set | open `/api/board` directly and read `note` — it names the exact failure |
| Why button says "explanation service is unreachable" | `/api/why` needs the same Supabase env vars as `/api/board`; the source line under the answer tells you whether the LLM or the built-in narrator answered |
| Why answers come from the "built-in narrator" | `WHY_API_KEY` isn't set (or the model call failed) — that's the designed fallback, same honesty rules, zero hallucination surface |
| everything NO DATA at night | recorder must be live (check Supabase `recorder_runs`) and the hour needs ≥30 snapshots per market; `recorded` age growing = recorder down |
| want to run locally (needs a computer) | `npm install && npm test && npm run dev` |

## Security notes

- The service-role key lives only in Vercel env vars and is read exclusively
  inside the server-side API route.
- The route exposes only the board JSON (costs, freshness, coverage) — no
  raw market data, no secrets.
- RLS stays on in Supabase; the service role bypasses it server-side, as
  designed for the recorder.

## Testing the link preview (after deploy)

1. Open **opengraph.xyz** and paste your Vercel URL — you should see the
   card: title "Firstlight: is it executable overnight?", the description,
   and the 1200×630 image (board + glass pane + king + five chips).
2. Or the **X card validator** (cards-dev.twitter.com/validator) with the
   same URL — expect `summary_large_image`.
3. The image URLs the meta tags point at are the Next.js file-convention
   routes: `https://<your-domain>/opengraph-image` and
   `https://<your-domain>/twitter-image` (they serve the PNGs; you can
   open them directly to eyeball). The favicon is at `/icon`.
