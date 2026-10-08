# Firstlight — the overnight execution board, wired to /api/board

A Next.js app that serves the overnight board at
**`/api/board?size=1000&view=last_night`**. The page: a **photoreal
candlestick strategy-room scene** (`public/bg/board-desktop.jpg`, with a
9:16 phone version) fixed behind everything — dark walnut, chessboard,
white-and-gold candlestick charts rising above the board on the right —
with an **asymmetric scrim** on top (dark on the left/hero side, open on
the right so the candles read clearly; every label keeps 4.5:1 contrast)
and the glass UI floating above it: glass nav pill, glass panels, and
**the board as a grid of translucent glass cards**, one per hour per
instrument. Each card shows, from your recorder: the ticker
(NVDA/TSLA/AAPL/MSFT/SPY), the latest perp price (`px`, last 1-minute
close from `candles_1m`), that block's all-in cost in bp, a tiny
gold/ivory line of the block's per-minute closes (`closes[]`, max 60
points, plain SVG), and the verdict icon + label. Missing data shows
"no data". **No demo data and no demo fallback anywhere:** if the live
read fails the response is `mode:"error"` with an all-NO-DATA board and
the reason in `note`; values are never invented. No red/green anywhere —
direction reads through gold vs ivory and typography only, no arrows. On
the phone the cards stack 4-across (4×2 per screen) with the same fields.
Tap any card for its evidence. A fixed **ticker row** sits directly under
the nav, and the **bell in the nav opens the live Telegram-alerts menu**.
If the background photo fails to load, it hides itself and a dark walnut
gradient shows — never a broken image. Phone keeps at most 3 blur layers;
blur is never animated.

- **`view=last_night` (default)** — the most recent *completed* weekday
  night (Mon–Thu 20:00 → next day 04:00 ET), 8 hourly blocks.
- **`view=weekend`** — the weekend session in progress (blocks fill in with
  real recordings as their hours complete), else the most recent completed
  one; 8 blocks × 7 h from Fri 20:00 ET.
- **`view=tonight`** (internal, used by the alert checker) — the weekday
  night *currently running*: completed blocks count, the in-progress hour
  evaluates as of now, future blocks are NO DATA.
- **`size=1000|5000|25000`** — your trade size; every cost figure is the
  all-in round-trip at that size (book walk + fees).
- A block/hour with **fewer than 30 snapshots per market stays NO DATA**
  (engine pre-registration) and estimates nothing.
- `recorded` = age of the newest recorder write → the "recorded N h ago"
  stamp. The badge reads **LIVE – RECORDED** only while numbers genuinely
  come from Supabase.

**Link previews** are wired too: the page ships Open Graph + X-card
metadata (`app/layout.js`) and a 1200×630 share image
(`app/opengraph-image.png`, copied to `app/twitter-image.png`) built on
the *same* crisp candlestick scene as the page background, with the words
drawn in code so the spelling is exact: **Firstlight** (ivory + gold
serif), a thin gold rule, tagline **"Is it executable tonight?"**, small
line **NVDA · TSLA · AAPL · MSFT · SPY**. The image deliberately shows
**no data** (no prices, no percentages, no +/− numbers, no red/green, no
arrows) because it is cached for days — text contrast is 16:1+ and the
PNG is under 600 KB. `app/icon.png` (512×512, the knight with the
Firstlight wordmark, readable at 32px) is the favicon.

The candlestick atmosphere lives entirely **in the photo itself** — no
code-drawn chart layer (the earlier `bg__holo` SVG was removed: it read
faint and blurry behind the glass).

How the page is built (plain JS everywhere, `node --check` verifies every
file): `app/page.js` renders the static markup from `lib/shell.js` (one
template string), `app/globals.css` is the full stylesheet, and
**`public/ui.js` does everything else in the browser**: fetches
`/api/board`, renders the 40 real glass cards (ticker · px · closes line ·
bp · verdict, via the pure `closesPath` helper), the hero numbers (all-in
cost / tape age / verdict — observed values only), the badge + stamp, the
tap-to-open evidence (every figure observed/estimated with its n), the
$1,000/$5,000/$25,000 selector, the views, the ticker row, the
chess-clock card reveal, and the bell menu's Telegram deep links (they
follow the selected size). The background photos live in `public/bg/`
(desktop + 9:16 mobile, each under 400 KB, no text/numbers in them); the
scrim + glass panes sit above the photo, cards never contain imagery.

Server side: `app/api/board` serves the board, `app/api/why` powers the
Why chat, and `app/api/telegram` (+ `/api/telegram/cron`) are the
Telegram-alert endpoints (webhook + checker). `lib/engine.js` is the
deterministic engine, `lib/supabase.js` the read/write adapter,
`lib/why.js` the explainer, `lib/alerts.js` + `lib/alertsend.js` +
`lib/telegram.js` the alert logic.

---

## Part 1 — Update GitHub from your laptop (~5 min)

The repo `firstlight-app` already exists on GitHub and Vercel deploys it
on every push. To ship an update:

1. Download **`firstlight-app.zip`** from this workspace and unzip it —
   it contains exactly the files that belong in the repo (23 files).
2. **Either with git** (once: `git clone
   https://github.com/YOU/firstlight-app`, copy the unzipped files over
   the clone, then `git add -A && git commit -m "telegram alerts" &&
   git push`)…
3. …**or without git**: github.com → your repo → **Add file → Upload
   files** → drag the unzipped files and folders in (GitHub keeps the
   folder structure) → **Commit changes**.
4. Vercel redeploys automatically (~1–2 min). The `.gitignore` already in
   the repo is unchanged; `test/` stays out of GitHub (local verification
   only), and no real key or token is ever in any of these files.

Repo contents (23): `package.json`, `.env.example`, `README.md`,
`lib/engine.js`, `lib/supabase.js`, `lib/shell.js`, `lib/why.js`,
`lib/alerts.js`, `lib/alertsend.js`, `lib/telegram.js`,
`app/layout.js`, `app/globals.css`, `app/page.js`,
`app/api/board/route.js`, `app/api/why/route.js`,
`app/api/telegram/route.js`, `app/api/telegram/cron/route.js`,
`public/ui.js`, `public/bg/board-desktop.jpg`,
`public/bg/board-mobile.jpg`, `app/opengraph-image.png`,
`app/twitter-image.png`, `app/icon.png`.

## Part 2 — Deploy to Vercel (first time) / env vars (any time)

First deploy: vercel.com → **Continue with GitHub** → **Add New… →
Project** → import `firstlight-app` → leave every build setting as-is.
**Before deploying, add the environment variables** — Vercel → Project →
Settings → Environment Variables:

| Name | Required | Value (where to get it) |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase → Project Settings → API Keys → `service_role` |
| `TELEGRAM_BOT_TOKEN` | for alerts | the BotFather token — a password, it lives ONLY here |
| `TELEGRAM_WEBHOOK_SECRET` | for alerts | any long random text you invent (also used once in the setWebhook URL) |
| `TELEGRAM_CRON_SECRET` | for alerts | any long random text you invent (the same text goes inside the Supabase pg_cron SQL) |
| `WHY_API_KEY`, `WHY_API_URL`, `WHY_MODEL` | optional | LLM phrasing for the Why chat and alert texts; without them the built-in narrator is used |
| `NEXT_PUBLIC_SITE_URL` | optional | your final URL if it differs from `https://firstlight-app.vercel.app` (inlined at build time → needs a **Redeploy** when changed) |

⚠ The service key and the bot token are used **server-side only** and are
never committed to GitHub (that's why there is no `.env` file in the repo,
only `.env.example` with placeholders).

After adding or changing any variable: Deployments → latest → **⋯** →
**Redeploy** (leave "Use existing build cache" unticked).

## What you should see

- **The page**: the candlestick scene behind everything (crisp on the
  right, scrimmed on the left), glass nav + panels, the 40 glass cards
  filling in chess-clock style as you scroll to the board, hero numbers
  on the left. Gold, cream and bronze only — no red, no green, ever.
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
  glance.
- **Open on Bitget** (in the panel): appears only when the evidence
  supports a venue (perp within 15 bp, or spot within 35 bp with verified
  tape) and links to the real market page. No keys, no order placement.
- **Why this square?** (in the panel): a plain-words explanation from
  that square's evidence object only — missing values are said as
  "no data", never a guess, never buy/sell language.
- **Ticker strip** under the top bar: one chip per name — latest
  completed hour's verdict + perp cost. No prices, no up/down arrows.
- **State light** (hero): `LIVE – RECORDED` when the board lands; honest
  `NO DATA · LIVE READ UNAVAILABLE` on failure.
- **Bell (nav, right)**: the live Telegram-alerts menu — one button per
  ticker, pre-filled with your selected size.
- **`mode: "live"`** in the JSON once the env vars are set; `mode:
  "error"` (all cells NO DATA + `note`) when the live read fails. Nothing
  is ever invented.
- A freshly recorded night needs each hour to have ≥30 snapshots per
  market — with the v0.4 staggered cadence that's ~60 minutes of the hour
  being captured.

## Telegram alerts (live)

`@FirstlightAlertsBot` messages you — information only, never advice:

- **Subscribe**: on the site, tap the **bell** → tap a ticker (say NVDA).
  Telegram opens with `?start=NVDA_1000` pre-filled → press **Start**.
  The webhook (`/api/telegram`) stores your chat + ticker + size in
  Supabase `tg_subs` (service-role only, RLS on, no policies) and replies
  with a confirmation that has a **"Send me a test alert now"** button.
- **Nightly Brief**: the first checker run inside the **20:00 ET hour**
  sends one message per chat — one line per subscription with the last
  completed night's numbers (status, blocks actionable, median perp
  all-in with n).
- **Change alerts**: whenever a subscribed instrument's overall status
  (computed from **completed blocks** of the live board) *transitions
  into* ACTIONABLE or DARK, every subscriber of that ticker+size gets one
  message — once per event, never per run. First sighting only records
  the baseline.
- **Commands**: `/test` (a real message from the engine's numbers — same
  as the button), `/stop` (unsubscribe everything) or
  `/stop NVDA_1000` (unsubscribe one).
- **Scheduling**: **Supabase `pg_cron`** calls `/api/telegram/cron` every
  5 minutes with the shared `TELEGRAM_CRON_SECRET` — deliberately not
  Vercel Cron (Hobby plan = once per day only).

Setup is three env vars + one SQL block + one webhook registration — the
exact beginner walkthrough (with the SQL, placeholders only) is in
**`TELEGRAM_SETUP.md`** in this workspace. The short version:

```sql
-- Supabase SQL editor (placeholders only — never paste real secrets in chat)
create table if not exists tg_subs (
  chat_id text not null, ticker text not null, size_usd integer not null,
  created_at timestamptz not null default now(),
  primary key (chat_id, ticker, size_usd));
alter table tg_subs enable row level security;
create table if not exists tg_state (
  key text primary key, value text not null,
  updated_at timestamptz not null default now());
alter table tg_state enable row level security;
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('firstlight-telegram', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://firstlight-app.vercel.app/api/telegram/cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('secret', 'PASTE_YOUR_CRON_SECRET'));
$$);
```

…and register the webhook once, in a browser address bar (the token goes
straight to Telegram over HTTPS, never into a file):

```
https://api.telegram.org/bot<PASTE_BOT_TOKEN>/setWebhook?url=https://firstlight-app.vercel.app/api/telegram&secret_token=<PASTE_WEBHOOK_SECRET>
```

You should see `{"ok":true,"result":true,"description":"Webhook was set"}`.

## Role of the LLM

**The engine decides; the LLM only explains.** Every verdict, cost and
freshness figure comes from the deterministic engine (`lib/engine.js`) —
pre-registered thresholds, no discretion. The LLM is never in that path:
when `WHY_API_KEY` is set, it only *phrases* what the engine already
computed (the Why chat's answers and, in alerts, the wording around the
evidence object), under rules that forbid adding or re-rounding numbers,
direction words, predictions or advice. Without a key the built-in
deterministic narrator does the phrasing with the same honesty rules —
the product works identically either way, just less conversational.

## Troubleshooting

| symptom | fix |
|---|---|
| build fails on Vercel | check `package.json` was uploaded exactly (typo → npm install fails) |
| page renders but no styles / no interactivity | `app/globals.css` or `public/ui.js` missing or misnamed |
| link preview shows no image | the three PNGs must be at `app/opengraph-image.png`, `app/twitter-image.png`, `app/icon.png`; check `view-source:` for `<meta property="og:image">`; if the URL is wrong, set `NEXT_PUBLIC_SITE_URL` and **Redeploy** |
| X still shows an old preview | X caches cards hard — retest with a card validator after a redeploy |
| `/api/board` note says "missing env" | the two Supabase env variables aren't set or are misnamed; then **Redeploy** |
| badge says "no data — live read unavailable" but env is set | open `/api/board` directly and read `note` — it names the exact failure |
| Why answers come from the "built-in narrator" | `WHY_API_KEY` isn't set (or the model call failed) — that's the designed fallback, same honesty rules |
| subscribed in Telegram but nothing arrives | (1) env vars `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `TELEGRAM_CRON_SECRET` set, then **Redeploy**? (2) webhook registered (`setWebhook` returned ok:true)? (3) `select * from cron.job;` in Supabase shows `firstlight-telegram`? (4) you pressed **Start** (bots can't write first)? Test manually: open `https://firstlight-app.vercel.app/api/telegram/cron?key=YOUR_CRON_SECRET` — its JSON says exactly what happened |
| want to stop the 5-minute checks | Supabase SQL editor: `select cron.unschedule('firstlight-telegram');` |
| everything NO DATA at night | recorder must be live (check Supabase `recorder_runs`) and the hour needs ≥30 snapshots per market; `recorded` age growing = recorder down |
| want to run locally | `npm install && npm test && npm run dev` |

## Security notes

- The service-role key and the bot token live only in Vercel env vars and
  are read exclusively inside server-side routes.
- `TELEGRAM_WEBHOOK_SECRET` and `TELEGRAM_CRON_SECRET` are long random
  texts you invent; the webhook secret proves updates come from Telegram,
  the cron secret proves checker calls come from your own Supabase. Real
  values never appear in the repo, in chat, or in screenshots — the SQL
  above uses placeholders.
- The routes expose only board JSON and alert outcomes — no raw market
  data, no secrets, ever echoed back.
- RLS stays on everywhere; the service role bypasses it server-side, as
  designed. `tg_subs` / `tg_state` have RLS on **with no policies**, so
  nothing is reachable with the anon key.

## Testing the link preview (after deploy)

1. Open **opengraph.xyz** and paste your Vercel URL — you should see the
   card: title "Firstlight: is it executable overnight?", the description,
   and the 1200×630 candlestick image with the Firstlight wordmark.
2. Or the **X card validator** with the same URL — expect
   `summary_large_image`.
3. The image URLs the meta tags point at are the Next.js file-convention
   routes: `https://<your-domain>/opengraph-image` and
   `https://<your-domain>/twitter-image`. The favicon is at `/icon`.
