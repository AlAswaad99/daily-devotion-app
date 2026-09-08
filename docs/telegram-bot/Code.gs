/**
 * Temuagn's sign-in bot — the Telegram-facing half.
 *
 * Handles /start and the contact-share that follows it, and writes the result
 * to Supabase's `telegram_links` table. Delivering the OTP itself is a
 * separate Supabase Edge Function (supabase/functions/telegram-send-otp),
 * not this script — see ../telegram-bot.md for why: Apps Script Web Apps
 * cannot read the signed-webhook headers Supabase's Send SMS Hook sends, and
 * always answer with HTTP 200 regardless of what this code returns, so it
 * can't verify the caller or report failure the way that hook needs.
 *
 * Setup — see ../telegram-bot.md for the full walkthrough. Short version:
 *
 *   1. Paste this file into a new Apps Script project (script.new).
 *   2. Project Settings → Script Properties, set:
 *        BOT_TOKEN         — from @BotFather
 *        SUPABASE_URL      — https://<ref>.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY — Supabase dashboard → Settings → API
 *        WEBHOOK_SECRET    — any random string you make up yourself
 *   3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *      Copy the deployment URL.
 *   4. Set WEB_APP_URL below (in registerTelegramWebhook) to that URL with
 *      ?secret=<the same WEBHOOK_SECRET> appended, then run
 *      registerTelegramWebhook once from the editor (Run ▸ registerTelegramWebhook).
 */

function doPost(e) {
  // Apps Script can't see request headers, so Telegram's own webhook-secret
  // feature isn't usable here — the secret travels in the URL's query string
  // instead, which Apps Script *does* parse for every request regardless of
  // method.
  if (!e.parameter || e.parameter.secret !== prop('WEBHOOK_SECRET')) {
    return ContentService.createTextOutput('forbidden')
  }

  const update = JSON.parse(e.postData.contents)

  // Telegram redelivers an update if it doesn't get a fast, clean response
  // back — and Apps Script's cold starts are routinely slow enough to miss
  // that window. Without this, every retry re-sends whatever this update
  // triggers, which is why /start was firing the same reply repeatedly.
  const cache = CacheService.getScriptCache()
  const dedupeKey = 'update_' + update.update_id
  if (cache.get(dedupeKey)) return ContentService.createTextOutput('ok')
  cache.put(dedupeKey, '1', 600) // 10 minutes comfortably covers Telegram's retry window

  const message = update.message
  if (!message) return ContentService.createTextOutput('ok')

  const chatId = message.chat.id

  if (message.text && message.text.indexOf('/start') === 0) {
    sendTelegram('sendMessage', {
      chat_id: chatId,
      text: 'Tap the button below to link this Telegram account — that\'s how we\'ll send your sign-in codes.',
      reply_markup: {
        keyboard: [[{ text: 'Share my phone number', request_contact: true }]],
        one_time_keyboard: true,
        resize_keyboard: true,
      },
    })
    return ContentService.createTextOutput('ok')
  }

  if (message.contact) {
    // Telegram lets someone share ANY contact from their phone, not only
    // their own — user_id on the shared contact matches the sender only
    // when it is genuinely their own Telegram-verified number.
    if (message.contact.user_id !== message.from.id) {
      sendTelegram('sendMessage', {
        chat_id: chatId,
        text: 'That has to be your own number — use the Share my phone number button.',
      })
      return ContentService.createTextOutput('ok')
    }

    linkPhone(normalisePhone(message.contact.phone_number), chatId)

    sendTelegram('sendMessage', {
      chat_id: chatId,
      text: 'You\'re linked. Go back to the Temuagn app to finish signing in.',
      reply_markup: { remove_keyboard: true },
    })
    return ContentService.createTextOutput('ok')
  }

  return ContentService.createTextOutput('ok')
}

/** Telegram contacts sometimes omit the leading +; Supabase phone auth needs E.164. */
function normalisePhone(raw) {
  return raw.charAt(0) === '+' ? raw : '+' + raw
}

function linkPhone(phone, chatId) {
  UrlFetchApp.fetch(prop('SUPABASE_URL') + '/rest/v1/telegram_links', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: prop('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: 'Bearer ' + prop('SUPABASE_SERVICE_ROLE_KEY'),
      Prefer: 'resolution=merge-duplicates',
    },
    payload: JSON.stringify({ phone: phone, chat_id: chatId }),
    muteHttpExceptions: true,
  })
}

function sendTelegram(method, payload) {
  const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + prop('BOT_TOKEN') + '/' + method, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  })
  return JSON.parse(res.getContentText())
}

function prop(name) {
  return PropertiesService.getScriptProperties().getProperty(name)
}

// ---------------------------------------------------------- one-time setup

/**
 * Run this once, manually, from the Apps Script editor (pick it in the
 * function dropdown, click Run) after deploying. Fill in WEB_APP_URL first —
 * the deployment URL from step 3 above, with ?secret=<WEBHOOK_SECRET> appended.
 */
function registerTelegramWebhook() {
  const WEB_APP_URL = 'PASTE_YOUR_DEPLOYMENT_URL_HERE?secret=PASTE_YOUR_WEBHOOK_SECRET_HERE'
  Logger.log(sendTelegram('setWebhook', { url: WEB_APP_URL }))
}
