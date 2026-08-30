/**
 * Run the planner for a date, the way pg_cron does in production.
 *
 *   node scripts/plan-notifications.mjs             plan today
 *   node scripts/plan-notifications.mjs 2026-09-01  plan a specific day
 */
const BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const headers = {
  apikey: SERVICE,
  authorization: `Bearer ${SERVICE}`,
  'content-type': 'application/json',
}

const rpc = async (fn, body = {}) => {
  const r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const t = await r.text()
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

const date = process.argv[2] ?? (await rpc('ministry_today'))
const written = await rpc('plan_notifications', { p_date: date })
console.log(`planned ${date}: ${written} candidate(s) considered`)

const queued = await (
  await fetch(
    `${BASE}/rest/v1/notifications?select=kind,suppressed_by&ministry_date=eq.${date}`,
    { headers },
  )
).json()

const live = queued.filter((n) => !n.suppressed_by)
const byKind = {}
for (const n of live) byKind[n.kind] = (byKind[n.kind] ?? 0) + 1

console.log(`${live.length} will be sent, ${queued.length - live.length} suppressed by the cap`)
for (const [kind, n] of Object.entries(byKind)) console.log(`  ${kind}: ${n}`)
