/**
 * Push a join code to someone who's stalled — activated Telegram, maybe even
 * verified their phone, but never finished onboarding. Called directly from
 * the admin dashboard's browser (Onboarding page, and now the Members page's
 * "Send code" too) — the only function in this project a browser calls
 * rather than GoTrue, pg_net, or Telegram, which is why it's also the only
 * one that needs CORS handling: every other function is a server-to-server
 * call with no browser origin to check in the first place.
 *
 * Wide open (`*`) rather than locked to the dashboard's own origin because
 * Vercel mints a fresh, unpredictable preview-deployment URL per branch/PR —
 * the actual access boundary is the admin-role check below, not CORS, which
 * only ever protects a cookie-authenticated request, and this one carries an
 * explicit bearer token instead.
 *
 * Two secrets needed:
 *   supabase secrets set TELEGRAM_BOT_TOKEN="..."
 * (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provisioned automatically.)
 */
// @ts-nocheck -- Deno runtime; the repo's tsconfig targets the Node/React workspaces.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')

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

const svc = (path: string) =>
  fetch(`${SUPABASE_URL}${path}`, {
    headers: { apikey: SERVICE_ROLE!, authorization: `Bearer ${SERVICE_ROLE}` },
  })

Deno.serve(async (req) => {
  // The browser's own preflight, sent before the real POST whenever the
  // request carries an Authorization header — never reaches application
  // code otherwise, so it has to be answered here, before anything else.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })

  if (!BOT_TOKEN) return json({ error: 'TELEGRAM_BOT_TOKEN is not set' }, 500)

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')
  if (!jwt) return json({ error: 'missing authorization' }, 401)

  // Who's calling — verify_jwt already confirmed the token is valid; this
  // confirms it belongs to an admin, not just any signed-in account.
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE!, authorization: `Bearer ${jwt}` },
  })
  if (!userRes.ok) return json({ error: 'invalid session' }, 401)
  const user = await userRes.json()

  const profileRes = await svc(`/rest/v1/profiles?id=eq.${user.id}&select=role`)
  const profiles = await profileRes.json()
  if (!profiles?.[0] || profiles[0].role !== 'admin') return json({ error: 'admin only' }, 403)

  const { phone, code } = await req.json().catch(() => ({}))
  if (!phone || !code) return json({ error: 'phone and code are required' }, 400)

  const linkRes = await svc(`/rest/v1/telegram_links?phone=eq.${encodeURIComponent(phone)}&select=chat_id`)
  const links = await linkRes.json()
  const chatId = links?.[0]?.chat_id
  if (!chatId) return json({ error: 'this phone has not activated Telegram yet' }, 404)

  const message = `Your Temuagn join code: ${code}\n\nEnter it in the app to finish joining.`
  const sendRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  })
  const sendBody = await sendRes.json()
  if (!sendBody.ok) return json({ error: sendBody.description ?? 'Telegram send failed' }, 502)

  return json({ ok: true })
})
