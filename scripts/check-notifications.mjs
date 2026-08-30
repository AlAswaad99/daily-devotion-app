/**
 * Phase 6's exit criterion, over HTTP: the ladder fires, the cap holds, and a
 * broadcast reaches the audience it says it will.
 *
 * The pgTAP suite simulates a month against the planner directly. This drives the
 * same paths the dashboard and the app use — RPCs under RLS as an admin and as a
 * member — so the wire contract is covered too.
 *
 *   node scripts/check-notifications.mjs
 */
const BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

let fails = 0
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (!pass) fails++
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}` +
      (pass ? '' : ` (expected ${JSON.stringify(expected)})`),
  )
}
const j = async (r) => {
  const t = await r.text()
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

const admin = await (async () => {
  const t = await j(
    await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dev@abide.local', password: 'abide12345' }),
    }),
  )
  return { apikey: ANON, authorization: `Bearer ${t.access_token}`, 'content-type': 'application/json' }
})()

const service = {
  apikey: SERVICE,
  authorization: `Bearer ${SERVICE}`,
  'content-type': 'application/json',
}

const rpc = async (headers, fn, body = {}) =>
  j(
    await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )

const today = await j(
  await fetch(`${BASE}/rest/v1/rpc/ministry_today`, { method: 'POST', headers: admin, body: '{}' }),
)

console.log('--- planning today')
// Planning is a scheduled job, so it runs with service credentials rather than as
// any particular person.
await j(
  await fetch(`${BASE}/rest/v1/rpc/plan_notifications`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ p_date: today }),
  }),
)

const all = await j(
  await fetch(
    `${BASE}/rest/v1/notifications?select=user_id,kind,priority,suppressed_by&ministry_date=eq.${today}`,
    { headers: service },
  ),
)
console.log(`    ${all.length} planned`)
ok('the ladder produced something', all.length > 0, true)

const perUser = new Map()
for (const n of all) {
  if (n.suppressed_by || n.kind === 'broadcast') continue
  perUser.set(n.user_id, (perUser.get(n.user_id) ?? 0) + 1)
}
const worst = Math.max(0, ...perUser.values())
ok('nobody exceeds two non-broadcast notifications', worst <= 2, true)

console.log('\n--- replanning is idempotent')
const before = all.length
await j(
  await fetch(`${BASE}/rest/v1/rpc/plan_notifications`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ p_date: today }),
  }),
)
const after = await j(
  await fetch(`${BASE}/rest/v1/notifications?select=id&ministry_date=eq.${today}`, {
    headers: service,
  }),
)
ok('replanning writes nothing new', after.length, before)

console.log('\n--- a member reads only their own')
const memberEmail = `notif+${Date.now()}@example.com`
const signup = await j(
  await fetch(`${BASE}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: memberEmail, password: 'devpassword123' }),
  }),
)
const member = {
  apikey: ANON,
  authorization: `Bearer ${signup.access_token}`,
  'content-type': 'application/json',
}
await fetch(`${BASE}/rest/v1/rpc/redeem_join_code`, {
  method: 'POST',
  headers: member,
  body: JSON.stringify({ p_code: 'ABIDE-DEV', p_display_name: 'Notify' }),
})

const theirs = await j(
  await fetch(`${BASE}/rest/v1/notifications?select=id,user_id`, { headers: member }),
)
ok(
  'a member sees none of anybody else’s notifications',
  theirs.every((n) => n.user_id === signup.user.id),
  true,
)

console.log('\n--- preferences')
await fetch(`${BASE}/rest/v1/notification_prefs`, {
  method: 'POST',
  headers: { ...member, prefer: 'resolution=merge-duplicates' },
  body: JSON.stringify({ user_id: signup.user.id, kind: 'daily_reminder', enabled: false }),
})

// Clear today and replan so the preference is exercised, not just stored.
await fetch(`${BASE}/rest/v1/notifications?ministry_date=eq.${today}`, {
  method: 'DELETE',
  headers: service,
})
await j(
  await fetch(`${BASE}/rest/v1/rpc/plan_notifications`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ p_date: today }),
  }),
)

const muted = await j(
  await fetch(
    `${BASE}/rest/v1/notifications?select=id&user_id=eq.${signup.user.id}&kind=eq.daily_reminder`,
    { headers: service },
  ),
)
ok('a muted kind is not planned for that member', muted.length, 0)

console.log('\n--- broadcasts')
const reachAll = await rpc(admin, 'broadcast_reach', { p_target: {} })
ok('reach is reported before sending', typeof reachAll === 'number' && reachAll > 0, true)

const reachCommitted = await rpc(admin, 'broadcast_reach', { p_target: { streak_at_least: 7 } })
ok('targeting narrows the audience', reachCommitted <= reachAll, true)

const profile = (await j(await fetch(`${BASE}/rest/v1/profiles?select=ministry_id&limit=1`, { headers: admin })))[0]
const broadcast = (
  await j(
    await fetch(`${BASE}/rest/v1/broadcasts`, {
      method: 'POST',
      headers: { ...admin, prefer: 'return=representation' },
      body: JSON.stringify({
        ministry_id: profile.ministry_id,
        title_en: 'Youth night on Friday',
        title_am: 'የወጣቶች ምሽት አርብ',
        body_en: 'Bring a friend.',
        body_am: 'ጓደኛ ይዘህ ና።',
        target: {},
        status: 'scheduled',
      }),
    }),
  )
)[0]

const sent = await rpc(admin, 'send_broadcast', { p_broadcast: broadcast.id })
ok('the broadcast reaches the whole audience', sent, reachAll)

const resend = await rpc(admin, 'send_broadcast', { p_broadcast: broadcast.id })
ok(
  'and cannot be sent twice',
  typeof resend?.message === 'string' && resend.message.includes('already been sent'),
  true,
)

// Broadcasts are deliberately outside the cap.
const withBroadcast = await j(
  await fetch(
    `${BASE}/rest/v1/notifications?select=user_id,kind,suppressed_by&ministry_date=eq.${today}`,
    { headers: service },
  ),
)
const capped = new Map()
for (const n of withBroadcast) {
  if (n.suppressed_by || n.kind === 'broadcast') continue
  capped.set(n.user_id, (capped.get(n.user_id) ?? 0) + 1)
}
ok('the cap still holds with a broadcast in flight', Math.max(0, ...capped.values()) <= 2, true)

console.log('\n--- delivery queue')
const due = await rpc(service, 'due_notifications', { p_limit: 10 })
ok('the delivery queue is readable', Array.isArray(due), true)
console.log(`    ${due.length} due now (tokens are empty until FCM is configured)`)

console.log(fails === 0 ? '\nAll notification checks passed.' : `\n${fails} FAILED`)
process.exit(fails === 0 ? 0 : 1)
