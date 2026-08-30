/**
 * Give the seeded dev account a realistic history to look at.
 *
 * Everything goes through the app's own sync path rather than being written
 * directly, so what you see is what the app would have produced: `sync_outbox`
 * decides each method, and the streak is recomputed by the server.
 *
 * Yesterday is deliberately left unread. With today complete, that makes the
 * `double_up` repair genuinely eligible, so the repair offer on the streak screen
 * can be seen rather than imagined.
 *
 *   node scripts/seed-demo-progress.mjs
 */
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const EMAIL = process.env.ABIDE_DEV_EMAIL ?? 'dev@abide.local'
const PASSWORD = process.env.ABIDE_DEV_PASSWORD ?? 'abide12345'

const signIn = await (
  await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
).json()

if (!signIn.access_token) {
  console.error('Could not sign in as the dev account. Has `supabase db reset` been run?')
  console.error(signIn)
  process.exit(1)
}

const H = {
  apikey: ANON,
  authorization: `Bearer ${signIn.access_token}`,
  'content-type': 'application/json',
}
const rpc = async (fn, body) =>
  (await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  })).json()

const pull = await rpc('pull_content', { p_since: null })
const today = pull.today

if (pull.days.length === 0) {
  console.error('No content. Run: pnpm --filter @abide/content import')
  process.exit(1)
}

const yesterday = (() => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
})()

const items = pull.days
  .filter((d) => d.scheduled_date <= today && d.scheduled_date !== yesterday)
  .map((d) => ({
    client_id: crypto.randomUUID(),
    entity: 'completion',
    op: 'upsert',
    payload: {
      devotion_day_id: d.id,
      // Each day claimed on its own date, which is what an honest reader's phone
      // would have sent.
      client_completed_at: `${d.scheduled_date}T07:20:00+03:00`,
      reading_seconds: 190,
      scroll_depth: 1,
      confirmed_early: false,
    },
  }))

// A couple of reflections, so the Reflect tab and the ✎ markers are not empty.
const withReflections = pull.days
  .filter((d) => d.scheduled_date < today && d.scheduled_date !== yesterday)
  .slice(0, 2)
  .map((d, i) => ({
    client_id: crypto.randomUUID(),
    entity: 'reflection',
    payload: {
      devotion_day_id: d.id,
      question_ordinal: 0,
      body:
        i === 0
          ? 'This one stayed with me — I keep coming back to the last line.'
          : 'Wrote this on the bus. Worth reading again at the end of the book.',
      updated_at: new Date().toISOString(),
    },
  }))

const favourite = pull.days
  .filter((d) => d.scheduled_date < today)
  .slice(0, 1)
  .map((d) => ({
    client_id: crypto.randomUUID(),
    entity: 'favorite',
    payload: { devotion_day_id: d.id },
  }))

const result = await rpc('sync_outbox', {
  p_items: [...items, ...withReflections, ...favourite],
})

console.log(`applied ${result.applied} item(s)`)
console.log(`streak: ${result.streak.current} current, ${result.streak.best} best`)
console.log(`left ${yesterday} unread on purpose, so the repair offer is eligible`)
