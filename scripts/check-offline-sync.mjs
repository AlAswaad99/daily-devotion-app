/**
 * Phase 3's exit criterion, end to end over HTTP.
 *
 * The pgTAP suite calls the sync functions directly; this drives them the way the
 * app does — through PostgREST, with the exact payload shape the outbox sends — so
 * the wire format is covered too, not just the SQL.
 *
 * Needs a running stack with content imported:
 *   pnpm db:start && pnpm --filter @abide/content import
 *   node scripts/check-offline-sync.mjs
 */
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
let failures = 0
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}${pass ? '' : ` (expected ${JSON.stringify(expected)})`}`)
}

const signup = await j(await fetch(`${URL}/auth/v1/signup`, { method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: `offline+${Date.now()}@example.com`, password: 'devpassword123' }) }))
const H = { apikey: ANON, authorization: `Bearer ${signup.access_token}`, 'content-type': 'application/json' }
const S = { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' }
const rpc = async (fn, body) => j(await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) }))

await fetch(`${URL}/rest/v1/rpc/redeem_join_code`, { method: 'POST', headers: H,
  body: JSON.stringify({ p_code: 'ABIDE-DEV', p_display_name: 'Offline', p_ui_language: 'en' }) })

// Join 20 days ago so there is a week of history to have missed.
const today = await rpc('ministry_today', {})
const back = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0,10) }
await fetch(`${URL}/rest/v1/profiles?id=eq.${signup.user.id}`, { method: 'PATCH',
  headers: { ...S, prefer: 'return=minimal' }, body: JSON.stringify({ joined_on: back(20) }) })

console.log('--- first pull (cold start, everything)')
let pulled = await rpc('pull_content', { p_since: null })
ok('days pulled', pulled.days.length > 0, true)
ok('server supplies today', pulled.today, today)
console.log(`    ${pulled.days.length} days, ${pulled.books.length} books, ${pulled.rounds.length} rounds`)

const dayIdFor = (date) => pulled.days.find(d => d.scheduled_date === date)?.id

console.log('\n--- a week in airplane mode: seven days read, queued locally')
const uuid = () => crypto.randomUUID()
const items = []
for (let n = 6; n >= 0; n--) {
  items.push({
    client_id: uuid(),
    entity: 'completion',
    op: 'upsert',
    payload: {
      devotion_day_id: dayIdFor(back(n)),
      // the device's own clock at the time it was read
      client_completed_at: `${back(n)}T07:15:00+03:00`,
      reading_seconds: 180,
      scroll_depth: 1,
      confirmed_early: false,
    },
  })
}
let flush = await rpc('sync_outbox', { p_items: items })
ok('all seven applied', flush.applied, 7)
ok('streak is the whole week', flush.streak.current, 7)
ok('nothing rejected', flush.rejected.length, 0)

console.log('\n--- the flush is retried (at-least-once delivery)')
flush = await rpc('sync_outbox', { p_items: items })
ok('every item skipped as a duplicate', flush.skipped, 7)
ok('streak unchanged', flush.streak.current, 7)
const completions = await j(await fetch(`${URL}/rest/v1/day_completions?select=devotion_day_id`, { headers: H }))
ok('no duplicate rows', completions.length, 7)

console.log('\n--- a device with its clock wound back')
// The device has now provably synced. Claiming an older day was read "on the day"
// cannot be true.
const cheat = [{
  client_id: uuid(), entity: 'completion', op: 'upsert',
  payload: { devotion_day_id: dayIdFor(back(9)), client_completed_at: `${back(9)}T07:15:00+03:00` },
}]
flush = await rpc('sync_outbox', { p_items: cheat })
ok('the streak is not extended by lying', flush.streak.current, 7)
const cheated = await j(await fetch(`${URL}/rest/v1/day_completions?select=method&devotion_day_id=eq.${dayIdFor(back(9))}`, { headers: H }))
ok('recorded as a backfill instead', cheated[0].method, 'backfill')

console.log('\n--- delta pull returns only what changed')
const cursor = pulled.server_time
const delta = await rpc('pull_content', { p_since: cursor })
ok('no content re-sent', delta.days.length, 0)
ok('but progress comes back', delta.completions.length, 8)

console.log('\n--- reflections: last write wins across two devices')
const dayToday = dayIdFor(today)
await rpc('sync_outbox', { p_items: [
  { client_id: uuid(), entity: 'reflection', payload: { devotion_day_id: dayToday, body: 'phone', updated_at: new Date(Date.now() - 3600e3).toISOString() } },
  { client_id: uuid(), entity: 'reflection', payload: { devotion_day_id: dayToday, body: 'tablet, written later', updated_at: new Date().toISOString() } },
]})
const refl = await j(await fetch(`${URL}/rest/v1/reflections?select=body`, { headers: H }))
ok('newer edit wins', refl[0].body, 'tablet, written later')

console.log(failures === 0 ? '\nAll offline-sync checks passed.' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
