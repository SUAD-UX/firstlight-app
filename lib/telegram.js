// ============================================================================
// Firstlight — lib/telegram.js (server-side only)
//
// Thin Telegram Bot API helpers. The bot token comes ONLY from the Vercel
// env var TELEGRAM_BOT_TOKEN — it never appears in code, files, logs,
// responses, or chat. Every call is time-boxed; failures return
// { ok: false, description } instead of throwing, so a webhook update is
// never lost to a transport hiccup.
// ============================================================================

const TG_BASE = "https://api.telegram.org/bot";

export async function tgApi(token, method, payload = {}) {
  try {
    const r = await fetch(TG_BASE + token + "/" + method, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const j = await r.json().catch(() => ({ ok: false, description: "bad json" }));
    return j && typeof j.ok === "boolean" ? j : { ok: false, description: "unexpected reply" };
  } catch (e) {
    return { ok: false, description: String((e && e.message) || e).slice(0, 120) };
  }
}

export function sendMessage(token, chatId, text, extra = {}) {
  return tgApi(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...extra,
  });
}

export function answerCallbackQuery(token, callbackQueryId, text) {
  return tgApi(token, "answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text } : {}),
  });
}
