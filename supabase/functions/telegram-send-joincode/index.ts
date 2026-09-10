/**
 * Self-service: "I'm on the join-code screen, send it to my Telegram." Called
 * by the mobile app itself the moment onboarding reaches that step — the
 * same automatic-delivery idea as the OTP's Send SMS Hook, just for a code
 * instead of an OTP, and client-triggered instead of a GoTrue hook, since
 * join codes are this app's own table, not something Supabase Auth knows
 * about. The point is a member never has to wait on an admin noticing them
 * in the Onboarding page and clicking Send code.
 *
 * Unlike telegram-nudge (admin-only, sends to *someone else*), this only
 * ever sends to the caller's own linked Telegram chat — resolved from their
 * own JWT, not a phone number the client supplies, so there's no way to
 * point this at anyone else's chat.
 *
 * Two branches:
 *   - Already has a profile (the routing bug this whole family of fixes
 *     targets, or any other edge case) — resend the code they actually
 *     redeemed, same as the admin dashboard's Members-page "Send code" now
 *     does, rather than a fresh one that would mean nothing next to their
 *     real membership.
 *   - No profile yet — mint a fresh one-time code (same shape and charset
 *     Code.gs and the admin dashboard already use) and send that. Minting
 *     again on every visit to this screen is deliberately not deduplicated:
 *     there's nowhere in the schema that records "already sent, unredeemed"
 *     against a phone, and an extra never-claimed code sitting in the pool
 *     is harmless — cheaper to accept than to add tracking for.
 *
 * Three secrets needed (BOT_TOKEN shared with telegram-nudge / Code.gs):
 *   supabase secrets set TELEGRAM_BOT_TOKEN="..."
 *   supabase secrets set DEFAULT_MINISTRY_ID="..."   (same value as Code.gs's
 *     MINISTRY_ID Script Property — this project is single-ministry, and a
 *     brand new signup with no profile yet has no other way to say which one)
 * (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provisioned automatically.)
 */
// @ts-nocheck -- Deno runtime; the repo's tsconfig targets the Node/React workspaces.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')
const MINISTRY_ID = Deno.env.get('DEFAULT_MINISTRY_ID')

// Matches apps/admin/src/app/onboarding/page.tsx and docs/telegram-bot/Code.gs —
// a code from any of the three sources should look the same to a member typing it in.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/I/1 — easy to misread

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })

const svc = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE!,
      authorization: `Bearer ${SERVICE_ROLE}`,
      ...(init.headers ?? {}),
    },
  })

function generateCode(): string {
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
  }
  return code
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  try {
    if (!BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 500)

    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
    if (!jwt) return json({ error: 'missing authorization' }, 401)

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE!, authorization: `Bearer ${jwt}` },
    })
    if (!userRes.ok) return json({ error: 'invalid session' }, 401)
    const user = await userRes.json()

    // auth.users.phone is digits-only; telegram_links (and every other Telegram
    // piece) keys on the +-prefixed E.164 form. Same mismatch flagged in
    // telegram-send-otp/index.ts, fixed the same way here.
    const phone: string | undefined = user.phone
    if (!phone) return json({ error: 'no phone number on this account' }, 400)
    const e164 = phone.startsWith('+') ? phone : `+${phone}`

    const linkRes = await svc(`/rest/v1/telegram_links?phone=eq.${encodeURIComponent(e164)}&select=chat_id`)
    const links = await linkRes.json()
    const chatId = links?.[0]?.chat_id
    if (!chatId) return json({ error: 'Telegram is not activated for this phone yet' }, 404)

    const profileRes = await svc(`/rest/v1/profiles?id=eq.${user.id}&select=id`)
    const profiles = await profileRes.json()

    let code: string | undefined
    if (profiles?.[0]) {
      // Already a member — resend whichever code they actually redeemed rather
      // than minting one that wouldn't mean anything next to a real membership.
      const codeRes = await svc(
        `/rest/v1/join_codes?redeemed_by=eq.${user.id}&select=code&limit=1`,
      )
      const codes = await codeRes.json()
      code = codes?.[0]?.code
      if (!code) return json({ error: 'already a member; no join code on file to resend' }, 200)
    } else {
      if (!MINISTRY_ID) return json({ error: 'DEFAULT_MINISTRY_ID is not set' }, 500)
      code = generateCode()
      const insertRes = await svc('/rest/v1/join_codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, ministry_id: MINISTRY_ID, max_uses: 1 }),
      })
      if (!insertRes.ok) return json({ error: 'could not create a join code' }, 500)
    }

    const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔑 <b>Your Temuagn join code</b>\n\n<code>${code}</code>\n\nEnter it in the app to finish joining.`,
        parse_mode: 'HTML',
      }),
    })
    const sendBody = await sendRes.json()
    if (!sendBody.ok) return json({ error: sendBody.description ?? 'Telegram send failed' }, 502)

    return json({ ok: true })
  } catch (err) {
    console.error('telegram-send-joincode threw:', err)
    const message = err instanceof Error ? err.message : String(err)
    return json({ error: `telegram-send-joincode: ${message}` }, 500)
  }
})
