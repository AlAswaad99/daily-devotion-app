/**
 * The actual Telegram webhook target — a thin relay to the Apps Script bot,
 * not a copy of its logic.
 *
 * Every Google Apps Script Web App URL answers with an HTTP 302 to
 * script.googleusercontent.com to serve its real content, unconditionally,
 * regardless of what the script itself returns. Telegram's webhook client
 * doesn't follow redirects (confirmed via getWebhookInfo: "Wrong response
 * from the webhook: 302 Found") — Apps Script genuinely can't be a direct
 * webhook target. This function is the fix: Telegram calls this, this
 * follows the redirect itself (re-issuing the POST explicitly, since a
 * redirected POST commonly gets silently downgraded to a GET otherwise) to
 * reach the bot's real logic in docs/telegram-bot/Code.gs, and always
 * answers Telegram with a clean 200 so it stops retrying regardless of how
 * that inner call goes.
 *
 * Two independent secrets, one per hop:
 *   - Telegram → here: TELEGRAM_WEBHOOK_SECRET, checked against the
 *     X-Telegram-Bot-Api-Secret-Token header (set via `secret_token` on
 *     setWebhook — see registerTelegramWebhook in Code.gs).
 *   - here → Apps Script: unchanged, the `?secret=` query param already
 *     embedded in TELEGRAM_BOT_GAS_URL, checked by the script itself.
 *
 * Secrets needed:
 *   supabase secrets set TELEGRAM_WEBHOOK_SECRET="..."
 *   supabase secrets set TELEGRAM_BOT_GAS_URL="https://script.google.com/macros/s/.../exec?secret=..."
 */
// @ts-nocheck -- Deno runtime; the repo's tsconfig targets the Node/React workspaces.

const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
const GAS_URL = Deno.env.get('TELEGRAM_BOT_GAS_URL')

Deno.serve(async (req) => {
  if (!GAS_URL) return new Response('TELEGRAM_BOT_GAS_URL is not set', { status: 500 })

  if (WEBHOOK_SECRET && req.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
    // Still 200: an unrecognised caller isn't Telegram retry-worthy, and a
    // non-2xx here would just be one more "wrong response" to log.
    return new Response('ok', { status: 200 })
  }

  const body = await req.text()

  try {
    const first = await fetch(GAS_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/json' },
      body,
    })

    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get('location')
      if (location) {
        await fetch(location, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        })
      }
    }
  } catch (_error) {
    // Swallowed deliberately — see the file comment. Telegram gets a clean
    // 200 either way; check this function's logs to see a forwarding failure.
  }

  return new Response('ok', { status: 200 })
})
