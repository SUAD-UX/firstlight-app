// ============================================================================
// Firstlight — /api/telegram (the Telegram webhook, Part E)
//
// Telegram POSTs every bot update here. The webhook is registered ONCE via
// setWebhook with a secret_token; every update must then carry it in the
// X-Telegram-Bot-Api-Secret-Token header or it is rejected (401).
//
// Handles:
//   /start <TICKER>_<SIZE>   deep link from the site's bell menu → stores
//                            chat_id + ticker + size in Supabase tg_subs and
//                            replies with a confirmation that carries a
//                            "Send me a test alert now" inline button.
//   /stop [<TICKER>_<SIZE>]  unsubscribe (that one, or everything)
//   /test                    one real message from the engine's numbers
//   callback_query "test"    the inline button = same as /test
//   anything else            short help
//
// Storage: Supabase tables tg_subs / tg_state — service-role only (RLS on,
// no policies, so nothing is reachable with the anon key). The bot token
// and the webhook secret live ONLY in Vercel env vars, never in code,
// files, or responses. The handler always answers 200 on valid updates —
// Telegram retries non-200 forever, and a retry can't fix a config error.
// ============================================================================

import { NextResponse } from "next/server";
import { rest, restMutate } from "../../../../lib/supabase.js";
import { sendMessage, answerCallbackQuery } from "../../../../lib/telegram.js";
import { parseStartPayload, parseStopPayload, testAlertText } from "../../../../lib/alerts.js";
import { boardFacts, factLine } from "../../../../lib/alertsend.js";

export const dynamic = "force-dynamic";

const HELP =
  "Firstlight alerts: open the site, tap the bell (top right) and choose a " +
  "ticker — that opens this bot with your size pre-filled. Commands: " +
  "/test sends a real message from the engine's numbers · /stop unsubscribes.";

async function sendTest(token, chatId) {
  const { rows } = await rest("tg_subs",
    { select: "chat_id,ticker,size_usd", chat_id: "eq." + chatId });
  if (!rows.length) {
    return sendMessage(token, chatId,
      "No subscriptions yet — open the site's bell menu and tap a ticker.");
  }
  const { facts } = await boardFacts(rows);
  return sendMessage(token, chatId, testAlertText(facts.map(factLine)));
}

export async function POST(request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  const hdr = request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!secret || hdr !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
  }

  const update = await request.json().catch(() => null);
  if (!update || typeof update !== "object") {
    return NextResponse.json({ ok: true });
  }

  try {
    const cb = update.callback_query;
    if (cb) {
      await answerCallbackQuery(token, cb.id);
      if ((cb.data || "") === "test") {
        const chatId = String(
          (cb.message && cb.message.chat && cb.message.chat.id) ??
          (cb.from && cb.from.id));
        if (chatId) await sendTest(token, chatId);
      }
      return NextResponse.json({ ok: true });
    }

    const msg = update.message || update.edited_message;
    const text = String((msg && msg.text) || "").trim();
    const chatId = msg && msg.chat && msg.chat.id != null ? String(msg.chat.id) : null;
    if (!chatId || !text) return NextResponse.json({ ok: true });

    if (text.startsWith("/start")) {
      const p = parseStartPayload(text);
      if (p) {
        await restMutate("POST", "tg_subs",
          { chat_id: chatId, ticker: p.ticker, size_usd: p.sizeUsd });
        await sendMessage(token, chatId,
          "Subscribed — " + p.ticker + " at " + usd(p.sizeUsd) + ".\n" +
          "You'll get the Nightly Brief at 20:00 ET and a message when " +
          p.ticker + " turns ACTIONABLE or DARK (checked every ~5 minutes).\n" +
          "Unsubscribe anytime: /stop", {
            reply_markup: { inline_keyboard: [[
              { text: "Send me a test alert now", callback_data: "test" },
            ]] },
          });
      } else {
        await sendMessage(token, chatId, "Welcome to Firstlight alerts.\n" + HELP);
      }
    } else if (text.startsWith("/stop")) {
      const p = parseStopPayload(text);
      if (p && p.ticker) {
        await restMutate("DELETE", "tg_subs", null, {
          chat_id: "eq." + chatId,
          ticker: "eq." + p.ticker,
          size_usd: "eq." + p.sizeUsd,
        });
        await sendMessage(token, chatId,
          "Unsubscribed — " + p.ticker + " at " + usd(p.sizeUsd) +
          ". No more messages for it. The site's bell menu re-subscribes you anytime.");
      } else {
        await restMutate("DELETE", "tg_subs", null, { chat_id: "eq." + chatId });
        await sendMessage(token, chatId,
          "Unsubscribed from everything. No more messages. The site's bell " +
          "menu re-subscribes you anytime.");
      }
    } else if (text.startsWith("/test")) {
      await sendTest(token, chatId);
    } else {
      await sendMessage(token, chatId, HELP);
    }
  } catch (e) {
    // answer 200 with the reason in the body — Telegram must not retry forever
    return NextResponse.json({
      ok: false, error: String((e && e.message) || e).slice(0, 140),
    });
  }
  return NextResponse.json({ ok: true });
}

// tiny local helper (kept out of the pure lib for clarity)
function usd(n) { return "$" + Number(n).toLocaleString("en-US"); }
