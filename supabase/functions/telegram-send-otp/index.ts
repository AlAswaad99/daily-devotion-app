/**
 * Supabase's Send SMS Auth Hook target.
 *
 * Supabase calls this on every OTP request, already carrying the generated
 * code — this only has to deliver it and answer with the status the hook
 * contract expects (2xx = sent, anything else = the sign-in attempt fails
 * with the error body's message). That status-code contract, and verifying
 * the request is genuinely from Supabase (signed per the Standard Webhooks
 * spec, in headers), are exactly what Google Apps Script can't do — Apps
 * Script Web Apps can't read request headers and always answer 200 regardless
 * of what the script returns. Hence this lives here instead of in the
 * Telegram-side bot (docs/telegram-bot/Code.gs), which only ever talks to
 * Telegram, not Supabase.
 *
 * Two secrets needed (TELEGRAM_BOT_TOKEN is shared with telegram-nudge):
 *   supabase secrets set TELEGRAM_BOT_TOKEN="..."
 *   supabase secrets set SEND_SMS_HOOK_SECRET="whsec_..."   (from the Dashboard
 *     when you create the hook: Authentication → Hooks → Send SMS Hook)
 *
 * Then point the hook's URL at this function's deployed address and set
 * `verify_jwt = false` for it in supabase/config.toml — GoTrue calls this
 * without a user JWT.
 */
// @ts-nocheck -- Deno runtime; the repo's tsconfig targets the Node/React workspaces.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const HOOK_SECRET = Deno.env.get('SEND_SMS_HOOK_SECRET')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/**
 * Standard Webhooks verification: HMAC-SHA256 of `${id}.${timestamp}.${body}`
 * with the secret (its `whsec_` prefix stripped, then base64-decoded),
 * compared against every `v1,<sig>` entry in the webhook-signature header —
 * there can be more than one during a secret rotation.
 */
async function verifySignature(rawBody: string, headers: Headers): Promise<boolean> {
  const id = headers.get('webhook-id')
  const timestamp = headers.get('webhook-timestamp')
  const signatureHeader = headers.get('webhook-signature')
  if (!id || !timestamp || !signatureHeader || !HOOK_SECRET) return false

  // The dashboard's secret is "v1,whsec_<base64>" — the version prefix, not
  // just "whsec_", has to go before what's left is valid base64.
  const keyBytes = base64ToBytes(HOOK_SECRET.replace(/^v1,/, '').replace(/^whsec_/, ''))
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signedContent = `${id}.${timestamp}.${rawBody}`
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent))
  const expected = bytesToBase64(new Uint8Array(digest))

  const candidates = signatureHeader.split(' ').map((entry) => entry.split(',')[1]).filter(Boolean)
  return candidates.includes(expected)
}

Deno.serve(async (req) => {
  try {
    if (!BOT_TOKEN) return json({ error: { message: 'TELEGRAM_BOT_TOKEN is not set' } }, 500)
    if (!HOOK_SECRET) return json({ error: { message: 'SEND_SMS_HOOK_SECRET is not set' } }, 500)

    const rawBody = await req.text()
    if (!(await verifySignature(rawBody, req.headers))) {
      return json({ error: { message: 'invalid signature' } }, 401)
    }

    const payload = JSON.parse(rawBody)
    const phone = payload.user?.phone
    const otp = payload.sms?.otp
    if (!phone || !otp) return json({ error: { message: 'malformed payload' } }, 400)

    // `telegram_links.phone` is stored with a leading + (E.164, matching what the
    // app sends to signInWithOtp); Supabase's own auth.users.phone — and this
    // hook's payload — is normally digits-only, no +. Unverified against a real
    // hook call yet: if lookups start missing, log `phone` here first.
    const linkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/telegram_links?phone=eq.${encodeURIComponent(`+${phone}`)}&select=chat_id`,
      { headers: { apikey: SERVICE_ROLE!, authorization: `Bearer ${SERVICE_ROLE}` } },
    )
    const links = await linkRes.json()
    const chatId = links?.[0]?.chat_id
    if (!chatId) {
      return json({ error: { message: 'This phone has not activated Telegram yet.' } }, 404)
    }

    const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔐 <b>Your Temuagn sign-in code</b>\n\n<code>${otp}</code>`,
        parse_mode: 'HTML',
      }),
    })
    const sendBody = await sendRes.json()
    if (!sendBody.ok) return json({ error: { message: sendBody.description ?? 'send failed' } }, 502)

    return json({})
  } catch (err) {
    // Anything thrown here would otherwise surface to GoTrue — and the app's
    // sign-in screen — as an opaque "unexpected status code returned from
    // hook: 500" with no way to tell what actually broke. Logging and
    // returning the real message turns that into something diagnosable both
    // in `supabase functions logs telegram-send-otp` and, since the hook's
    // error.message is shown verbatim on the sign-in screen, right in the app.
    console.error('telegram-send-otp threw:', err)
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: { message: `telegram-send-otp: ${message}` } }, 500)
  }
})
