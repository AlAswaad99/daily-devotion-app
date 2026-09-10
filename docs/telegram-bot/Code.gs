/**
 * Temuagn's sign-in bot — the Telegram-facing half.
 *
 * Handles /start and the contact-share that follows it, writes the result to
 * Supabase's `telegram_links` table, and mints a fresh one-time join code for
 * whoever just linked. Delivering the OTP itself is a separate Supabase Edge
 * Function (supabase/functions/telegram-send-otp), not this script — see
 * ../telegram-bot.md for why: Apps Script Web Apps cannot read the
 * signed-webhook headers Supabase's Send SMS Hook sends, and always answer
 * with HTTP 200 regardless of what this code returns, so it can't verify the
 * caller or report failure the way that hook needs.
 *
 * The join code IS minted here rather than in an Edge Function: it needs no
 * caller-authenticity check (nothing calls this except Telegram, via the
 * relay below) and this keeps "link succeeded" and "here is your code" one
 * atomic reply instead of a second round trip. Each code is generated fresh
 * per person rather than drawn from the admin dashboard's pre-generated
 * batch — pulling from that pool here would risk two people activating
 * close together being handed the same not-yet-redeemed code. It's inserted
 * into the same `join_codes` table either way, so it still shows up
 * alongside batch-generated codes in the dashboard's Onboarding page. The
 * dashboard's own "Send code" action is untouched — this only changes what
 * happens automatically the moment someone activates.
 *
 * Telegram itself does NOT call this script directly, even though the setup
 * below still runs from here — every Apps Script Web App URL answers with an
 * HTTP 302 to script.googleusercontent.com to actually serve its content, no
 * matter what the script returns, and Telegram's webhook client refuses to
 * follow redirects. What Telegram actually calls is a thin relay,
 * supabase/functions/telegram-webhook, which forwards each update here and
 * always answers Telegram with a clean 200 itself.
 *
 * Setup — see ../telegram-bot.md for the full walkthrough. Short version:
 *
 *   1. Paste this file into a new Apps Script project (script.new).
 *   2. Project Settings → Script Properties, set:
 *        BOT_TOKEN         — from @BotFather
 *        SUPABASE_URL      — https://<ref>.supabase.co
 *        SUPABASE_SERVICE_ROLE_KEY — Supabase dashboard → Settings → API
 *        WEBHOOK_SECRET    — any random string you make up yourself
 *        MINISTRY_ID       — the ministry rows should be created against;
 *                            copy it from any code already in the dashboard's
 *                            Onboarding page (or `select id from ministries`)
 *   3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 *      Copy the deployment URL — this is GAS_URL below and in telegram-webhook's
 *      TELEGRAM_BOT_GAS_URL secret, NOT what gets registered with Telegram.
 *   4. Deploy supabase/functions/telegram-webhook (see ../telegram-bot.md) —
 *      THAT function's URL is what Telegram calls.
 *   5. Set GAS_URL and WEB_APP_URL below (in registerTelegramWebhook), then run
 *      it once from the editor (Run ▸ registerTelegramWebhook). It registers
 *      the relay's URL with Telegram, with a secret_token Telegram will send
 *      back on every call — that's TELEGRAM_WEBHOOK_SECRET on the relay's side.
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

    // Not allowed to block the link confirmation — a member who is linked but
    // has to wait on "Send code" from an admin is still better off than one
    // who sees an error because code-minting hiccuped.
    const code = issueJoinCode()
    const text = code
      ? '✅ <b>You\'re linked!</b>\n\nYour join code: <code>' + code + '</code>\n\n' +
        'Enter it in the Temuagn app to finish signing in.'
      : '✅ <b>You\'re linked!</b>\n\nGo back to the Temuagn app to finish signing in.'

    sendTelegram('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
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

// Matches the admin dashboard's own charset (apps/admin/src/app/onboarding/page.tsx)
// so a code from either source looks the same to a member typing it in.
var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/I/1 — easy to misread

function generateCode() {
  var code = ''
  for (var i = 0; i < 6; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  }
  return code
}

/**
 * Mints one fresh, single-use code and inserts it — same table, same shape as
 * a batch-generated one, so it shows up in the dashboard's Onboarding page
 * too. Returns the code, or null if MINISTRY_ID isn't set or the insert
 * failed (network hiccup, say) — the caller falls back to the plain link
 * confirmation rather than blocking on this.
 */
function issueJoinCode() {
  var ministryId = prop('MINISTRY_ID')
  if (!ministryId) return null

  var code = generateCode()
  var res = UrlFetchApp.fetch(prop('SUPABASE_URL') + '/rest/v1/join_codes', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: prop('SUPABASE_SERVICE_ROLE_KEY'),
      Authorization: 'Bearer ' + prop('SUPABASE_SERVICE_ROLE_KEY'),
    },
    payload: JSON.stringify({ code: code, ministry_id: ministryId, max_uses: 1 }),
    muteHttpExceptions: true,
  })
  return res.getResponseCode() < 300 ? code : null
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
 * function dropdown, click Run) after deploying BOTH this script and
 * supabase/functions/telegram-webhook. Registers the relay's URL with
 * Telegram — not this script's own URL, see the file header — and sets a
 * secret_token that Telegram will echo back on the
 * X-Telegram-Bot-Api-Secret-Token header of every call, which the relay
 * checks against its own TELEGRAM_WEBHOOK_SECRET.
 */
function registerTelegramWebhook() {
  const RELAY_URL = 'PASTE_THE_DEPLOYED_telegram-webhook_FUNCTION_URL_HERE'
  const TELEGRAM_WEBHOOK_SECRET = 'PASTE_THE_SAME_SECRET_YOU_SET_ON_THE_RELAY_HERE'
  Logger.log(sendTelegram('setWebhook', { url: RELAY_URL, secret_token: TELEGRAM_WEBHOOK_SECRET }))
}
