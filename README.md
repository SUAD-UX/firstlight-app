# Firstlight

**Is a tokenized US stock actually executable tonight?**

Firstlight is an overnight execution board for tokenized US equities on Bitget. For **NVDA · TSLA · AAPL · MSFT · SPY**, at **$1k / $5k / $25k**, it answers four questions for every hour of the US overnight session:

1. Is the stock **executable** at my size, or not?
2. **Which venue** — the Bitget perpetual, or the rToken spot pair?
3. What is the **all-in round-trip cost** (book walk + fees)?
4. How **fresh is the spot tape** — when did the pair last actually trade?

**Live:** https://firstlight-app.vercel.app

Built solo for the **Bitget AI Base Camp Hackathon S2 — AI Trading Desk** track.

> Firstlight shows **execution quality, never direction.** No buy/sell signals, no price predictions, no advice.

---

## How it decides

A deterministic engine (`lib/engine.js`) gives every square one of four states. The thresholds are fixed in advance — no discretion, and no model in this path.

| State | Rule |
|---|---|
| **ACTIONABLE** | perp all-in round trip ≤ 15 bp **and** spot ≤ 35 bp **and** last spot print ≤ 30 min old |
| **THIN** | perp ≤ 15 bp, but spot is above 35 bp, its last print is older than 30 min, or it is unverified |
| **DARK** | perp above 15 bp, or the last perp print is older than 10 min |
| **NO DATA** | fewer than 30 snapshots per market in that hour — nothing is estimated |

Fees included in every cost figure: **perp 12 bp** round trip, **spot 20 bp** round trip.

### What the data shows

Spot rToken pairs print almost no trades overnight, while the perpetuals trade every hour. So the perp is often cheap enough to act on, but the spot leg cannot be verified as fresh — and most hours land on **THIN** rather than ACTIONABLE. Firstlight makes that visible instead of hiding it behind an average.

## Where the data comes from

A recorder (Supabase Edge Function on `pg_cron`) captures **order-book snapshots, 1-minute candles and fills every minute** into Supabase. The board is rebuilt from those recordings on every request.

- **No demo data and no fallback data anywhere.** If the live read fails, the API returns `mode: "error"` with an all-NO-DATA board and the reason. Values are never invented.
- Every figure carries its sample size (`n`).
- The badge reads **LIVE – RECORDED** only while the numbers genuinely come from Supabase.

## The AI layer — what it does and what it never does

**The engine decides. Text only explains.**

Tap a square, then **Why this square?** — you get a plain-words explanation built *only* from that square's evidence object (cost, depth, tape age, coverage, fills, with n for each). Missing values are said out loud as "no data".

- By default the explanation is written by a **built-in deterministic narrator** — same honesty rules, zero hallucination surface.
- If `WHY_API_KEY` is set, any OpenAI-compatible chat model can *phrase* the same evidence under a strict system prompt (no new numbers, no re-rounding, no direction words, no advice). The panel then names the model it used. If the model call fails, the narrator answers instead.
- The verdict itself is **never** produced by a model.

## Telegram alerts

**@FirstlightAlertsBot** — tap the bell on the site, pick a ticker, press **Start** in Telegram.

- **Nightly Brief** at 20:00 ET: last night's numbers per subscription.
- **Change alerts** when a subscribed instrument turns ACTIONABLE or DARK — once per event.
- Commands: `/test`, `/stop`, `/stop NVDA_1000`.
- Scheduling is Supabase `pg_cron` calling `/api/telegram/cron` every 5 minutes.

## Open on Bitget

When the evidence supports a venue (perp within 15 bp, or spot within 35 bp with a verified tape), the panel links to the real Bitget market page. No API keys, no order placement.

## Stack

Next.js 14 (App Router) · plain JS · Supabase (Postgres, Edge Functions, `pg_cron`) · Vercel Hobby · Telegram Bot API. No chart library — every chart is hand-drawn SVG.

```
app/page.js              renders the static markup from lib/shell.js
app/globals.css          full stylesheet
public/ui.js             browser logic: board, evidence panel, scroll reveal, bell
app/api/board            the board JSON  (?size=1000|5000|25000&view=last_night|weekend)
app/api/why              Why this square? explanation
app/api/telegram         Telegram webhook   (+ /cron: the 5-minute checker)
lib/engine.js            the deterministic engine
lib/supabase.js          read/write adapter
lib/why.js               evidence extraction, prompt, deterministic narrator
lib/alerts*.js, telegram.js   alert logic
```

## Run it yourself

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

Environment variables (set them in Vercel → Project → Settings → Environment Variables; **redeploy after changing any**):

| Name | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server-side read of the recordings — never sent to the browser |
| `TELEGRAM_BOT_TOKEN` | for alerts | BotFather token |
| `TELEGRAM_WEBHOOK_SECRET` | for alerts | long random text; proves updates come from Telegram |
| `TELEGRAM_CRON_SECRET` | for alerts | long random text; proves checker calls come from your Supabase |
| `WHY_API_KEY`, `WHY_API_URL`, `WHY_MODEL` | optional | LLM phrasing for Why this square; without them the built-in narrator is used |
| `NEXT_PUBLIC_SITE_URL` | optional | only if your URL differs from the default |

No keys or tokens are ever committed — `.env.example` holds placeholders only.

Without Supabase credentials the site still loads and honestly shows **NO DATA · LIVE READ UNAVAILABLE**.

## Honest limits

- Overnight liquidity is thin by nature; most hours are THIN, not ACTIONABLE. That is the finding, not a bug.
- Fill counts on busy tapes are page-capped at the newest 1,000 prints and can understate.
- A night needs at least 30 snapshots per market per hour to be scored; shorter coverage stays NO DATA.
- Costs are computed from recorded books at your size plus fixed fee assumptions; they are not a guarantee of a fill.
- This is an execution-quality tool, not financial advice.
