/**
 * Phase 5's exit criterion: the ministry can author and publish a book without an
 * engineer.
 *
 * Drives the dashboard's exact write path — the admin's own session with the anon
 * key, under RLS, with no service-role key anywhere — and checks the thing that
 * actually matters: that nothing reaches readers until it is published.
 *
 *   node scripts/check-admin-flow.mjs
 */
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

let failures = 0
const ok = (label, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected)
  if (!pass) failures++
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}` +
      (pass ? '' : ` (expected ${JSON.stringify(expected)})`),
  )
}

const json = async (r) => {
  const text = await r.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const signIn = async (email, password) => {
  const body = await json(
    await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),
  )
  if (!body.access_token) throw new Error(`could not sign in as ${email}: ${JSON.stringify(body)}`)
  return {
    apikey: ANON,
    authorization: `Bearer ${body.access_token}`,
    'content-type': 'application/json',
  }
}

const admin = await signIn('dev@abide.local', 'abide12345')

// A second, ordinary member — the audience the review flow protects.
const memberEmail = `member+${Date.now()}@example.com`
const signup = await json(
  await fetch(`${URL}/auth/v1/signup`, {
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
await fetch(`${URL}/rest/v1/rpc/redeem_join_code`, {
  method: 'POST',
  headers: member,
  body: JSON.stringify({ p_code: 'ABIDE-DEV', p_display_name: 'Member' }),
})

// Merge, do not overwrite: an outer `headers` that clobbers `init.headers` silently
// drops `prefer: return=representation`, and every insert comes back empty.
const rest = async (headers, path, init = {}) =>
  json(
    await fetch(`${URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    }),
  )

const profile = (await rest(admin, 'profiles?select=church_id,ministry_id,role&id=eq.' +
  '0d0d0d0d-0000-4000-8000-000000000001'))[0]
ok('the dev account is an admin', profile.role, 'admin')

const today = await json(
  await fetch(`${URL}/rest/v1/rpc/ministry_today`, { method: 'POST', headers: admin, body: '{}' }),
)

// Only one day may be scheduled per date per church — the ministry moves together.
// So this book gets a date the imported round does not already occupy.
const freeDate = (() => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 60)
  return d.toISOString().slice(0, 10)
})()

console.log('\n--- authoring a round, a book and a day as the admin')
const round = (
  await rest(admin, 'rounds', {
    method: 'POST',
    headers: { ...admin, prefer: 'return=representation' },
    body: JSON.stringify({
      church_id: profile.church_id,
      ministry_id: profile.ministry_id,
      phase_code: '04',
      round_code: '01',
      main_verse_en: 'A new round',
      main_verse_am: 'አዲስ ዙር',
      starts_on: freeDate,
      status: 'draft',
    }),
  })
)[0]
ok('round created', Boolean(round?.id), true)

const book = (
  await rest(admin, 'books', {
    method: 'POST',
    headers: { ...admin, prefer: 'return=representation' },
    body: JSON.stringify({
      church_id: profile.church_id,
      round_id: round.id,
      sequence: 99,
      source_id: 'ADMIN-TEST',
      title_en: 'Authored in the dashboard',
      title_am: 'በዳሽቦርድ የተዘጋጀ',
      status: 'draft',
    }),
  })
)[0]
ok('book created as a draft', book.status, 'draft')

const day = (
  await rest(admin, 'devotion_days', {
    method: 'POST',
    headers: { ...admin, prefer: 'return=representation' },
    body: JSON.stringify({
      church_id: profile.church_id,
      book_id: book.id,
      day_number: 1,
      topic_en: 'Written by an admin',
      topic_am: 'በአስተዳዳሪ የተጻፈ',
      purpose_en: 'Body text.',
      purpose_am: 'ሰውነት ጽሑፍ።',
      status: 'published',
      scheduled_date: freeDate,
    }),
  })
)[0]
ok('day created and scheduled', day?.scheduled_date, freeDate)

console.log('\n--- while the book is a draft, readers see nothing')
let memberDays = await rest(member, `devotion_days?select=id&book_id=eq.${book.id}`)
ok('member cannot see the day', memberDays.length, 0)

let pulled = await json(
  await fetch(`${URL}/rest/v1/rpc/pull_content`, {
    method: 'POST',
    headers: member,
    body: JSON.stringify({ p_since: null }),
  }),
)
ok(
  'and it is absent from their sync',
  pulled.days.filter((d) => d.book_id === book.id).length,
  0,
)

console.log('\n--- the review flow')
await rest(admin, `books?id=eq.${book.id}`, {
  method: 'PATCH',
  headers: { ...admin, prefer: 'return=minimal' },
  body: JSON.stringify({ status: 'in_review' }),
})
memberDays = await rest(member, `devotion_days?select=id&book_id=eq.${book.id}`)
ok('in review is still invisible to readers', memberDays.length, 0)

await rest(admin, `books?id=eq.${book.id}`, {
  method: 'PATCH',
  headers: { ...admin, prefer: 'return=minimal' },
  body: JSON.stringify({ status: 'published' }),
})
memberDays = await rest(member, `devotion_days?select=id,topic_en&book_id=eq.${book.id}`)
ok('publishing is what makes it visible', memberDays.length, 1)
ok('and the text is the one the admin wrote', memberDays[0]?.topic_en, 'Written by an admin')

console.log('\n--- every transition is recorded')
await rest(admin, 'content_revisions', {
  method: 'POST',
  headers: { ...admin, prefer: 'return=minimal' },
  body: JSON.stringify({
    church_id: profile.church_id,
    entity_type: 'book',
    entity_id: book.id,
    payload: { from: 'in_review' },
    author_id: '0d0d0d0d-0000-4000-8000-000000000001',
    status: 'published',
  }),
})
const revisions = await rest(admin, `content_revisions?select=status&entity_id=eq.${book.id}`)
ok('a revision row exists for the publish', revisions.length >= 1, true)

console.log('\n--- the privacy guarantee still holds for admins')
// The member writes something. An admin is a reader too, so the test is not "sees
// nothing" — it is "sees nothing of anyone else's".
await fetch(`${URL}/rest/v1/rpc/sync_outbox`, {
  method: 'POST',
  headers: member,
  body: JSON.stringify({
    p_items: [
      {
        client_id: crypto.randomUUID(),
        entity: 'reflection',
        payload: {
          devotion_day_id: memberDays[0].id,
          question_ordinal: 0,
          body: 'Something private the member wrote.',
          updated_at: new Date().toISOString(),
        },
      },
    ],
  }),
})

const theirs = await rest(member, 'reflections?select=body')
ok('the member can read their own reflection', theirs.length, 1)

const visibleToAdmin = await rest(admin, 'reflections?select=body')
ok(
  "an admin sees none of the member's reflections",
  visibleToAdmin.filter((r) => r.body === 'Something private the member wrote.').length,
  0,
)

const aggregate = await json(
  await fetch(`${URL}/rest/v1/rpc/ministry_engagement`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ p_from: freeDate, p_to: today }),
  }),
)
ok('but the aggregate still reports numbers', Array.isArray(aggregate), true)

console.log('\n--- cleaning up')
await rest(admin, `devotion_days?id=eq.${day.id}`, { method: 'DELETE', headers: admin })
await rest(admin, `books?id=eq.${book.id}`, { method: 'DELETE', headers: admin })
await rest(admin, `rounds?id=eq.${round.id}`, { method: 'DELETE', headers: admin })

console.log(failures === 0 ? '\nAll admin checks passed.' : `\n${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
