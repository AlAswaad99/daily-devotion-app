/**
 * Fill the local ministry with mock members, so the dashboard can be looked at with
 * a realistic crowd rather than a single dev account.
 *
 * Like `seed-demo-progress.mjs`, everything goes through the app's own paths — sign
 * up, redeem a join code, push completions through `sync_outbox` — so the streaks,
 * drop-off curves and language split are the ones the server computed, not numbers
 * written straight into tables. That matters here: streak state is derived, and a
 * hand-written streak would be a number the app itself would disagree with.
 *
 * `joined_on` is set before any completion is synced, because it is the late-joiner
 * boundary: days scheduled before it are excluded from streak maths, so setting it
 * afterwards would silently invalidate the history just written.
 *
 * Local development only. It creates real auth users in the local GoTrue.
 *
 *   node scripts/seed-mock-members.mjs [count]
 */
const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const JOIN_CODE = process.env.ABIDE_JOIN_CODE ?? 'ABIDE-DEV'
const PASSWORD = 'mockpassword123'

const NAMES = [
  'Selam Girma', 'Dawit Bekele', 'Hanna Tesfaye', 'Yonas Alemu',
  'Mekdes Haile', 'Abel Getachew', 'Ruth Mengistu', 'Biniam Assefa',
  'Tigist Worku', 'Nahom Kebede', 'Eyerusalem Tadesse', 'Samuel Desta',
  'Bethlehem Solomon', 'Kaleab Fikru', 'Meron Abebe', 'Yohannes Teklu',
  'Saron Belay', 'Dagmawi Negash', 'Feven Wondimu', 'Elias Mulugeta',
  'Rahel Ayele', 'Nathnael Yilma', 'Lidya Gebre', 'Amanuel Sisay',
]

/*
 * Streak targets chosen to land across every bucket the dashboard draws, rather
 * than at random — a distribution that happens to miss "30+" makes the chart look
 * broken when it is merely unlucky.
 */
const STREAK_PLAN = [
  0, 0, 0, 0, 0, 0,
  1, 2, 3, 3,
  4, 5, 6, 7, 7,
  9, 11, 13, 14,
  17, 22, 28,
  34, 41,
]

const PARTS = ['morning', 'morning', 'morning', 'evening', 'evening', 'night', 'afternoon']

/** Deterministic so repeated runs describe the same ministry. */
function makeRandom(seed) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
const random = makeRandom(20260903)

const count = Math.min(Number(process.argv[2] ?? NAMES.length), NAMES.length)
const slug = (name) => name.toLowerCase().replace(/[^a-z]+/g, '.')
const shiftDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const json = async (res) => {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text }
  }
}

const anonHeaders = { apikey: ANON, 'content-type': 'application/json' }

// One admin session first, only to read the calendar the members will act against.
const adminAuth = await json(
  await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: anonHeaders,
    body: JSON.stringify({ email: 'dev@abide.local', password: 'abide12345' }),
  }),
)
if (!adminAuth?.access_token) {
  console.error('Could not sign in as dev@abide.local. Is Supabase running and reset?')
  process.exit(1)
}

const adminHeaders = {
  ...anonHeaders,
  authorization: `Bearer ${adminAuth.access_token}`,
}

const content = await json(
  await fetch(`${URL}/rest/v1/rpc/pull_content`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ p_since: null }),
  }),
)

const today = content.today
const past = content.days
  .filter((d) => d.scheduled_date && d.scheduled_date <= today)
  .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))

if (past.length === 0) {
  console.error('No scheduled days up to today. Run: pnpm --filter @abide/content content:import')
  process.exit(1)
}

console.log(`${past.length} scheduled day(s) up to ${today}; seeding ${count} member(s)\n`)

let made = 0
let failed = 0

for (let i = 0; i < count; i++) {
  const name = NAMES[i]
  const email = `mock.${slug(name)}@abide.local`

  // Re-runnable: a second run signs the same people back in and re-applies the
  // plan, rather than failing on "already registered" and leaving half a ministry.
  let session = await json(
    await fetch(`${URL}/auth/v1/signup`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  )
  let returning = false

  if (!session?.access_token) {
    session = await json(
      await fetch(`${URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: anonHeaders,
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    )
    returning = true
  }

  if (!session?.access_token) {
    console.warn(`  ! ${name}: ${session?.msg ?? session?.error_description ?? 'signup failed'}`)
    failed++
    continue
  }

  const H = { ...anonHeaders, authorization: `Bearer ${session.access_token}` }

  const existing = await json(
    await fetch(`${URL}/rest/v1/profiles?select=id&id=eq.${session.user.id}`, { headers: H }),
  )

  if (!Array.isArray(existing) || existing.length === 0) {
    const redeemed = await json(
      await fetch(`${URL}/rest/v1/rpc/redeem_join_code`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify({ p_code: JOIN_CODE, p_display_name: name }),
      }),
    )
    if (redeemed?.code || redeemed?.message) {
      console.warn(`  ! ${name}: could not redeem ${JOIN_CODE} — ${redeemed.message ?? redeemed.code}`)
      failed++
      continue
    }
  }

  const target = Math.min(STREAK_PLAN[i] ?? 0, past.length - 1)
  /*
   * Most of the ministry was already here when the round began, and a minority
   * joined part-way through. That split is what makes the drop-off chart mean
   * anything: if everyone joined recently, day 1 has fewer readers than day 20 and
   * the curve climbs, which is arrival being mistaken for retention.
   */
  const joinedBeforeContent = random() < 0.72
  const joinedAgo = joinedBeforeContent
    ? past.length + 4 + Math.floor(random() * 30)
    : Math.max(target + 1, Math.floor(random() * Math.min(past.length - 2, 18)) + 2)
  const joinedOn = shiftDays(today, -joinedAgo)

  const language = random() < 0.62 ? 'am' : 'en'
  const partOfDay = PARTS[Math.floor(random() * PARTS.length)]

  // Before any completion: `joined_on` is the late-joiner boundary, and days
  // scheduled before it are excluded from streak maths.
  await fetch(`${URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
    method: 'PATCH',
    headers: { ...H, prefer: 'return=minimal' },
    body: JSON.stringify({
      ui_language: language,
      reader_language: language,
      part_of_day: partOfDay,
      joined_on: joinedOn,
    }),
  })

  const available = past.filter((d) => d.scheduled_date >= joinedOn)
  const streakDays = target > 0 ? available.slice(-target) : []
  // The day before the streak stays unread on purpose — otherwise the run would
  // reach further back than intended and every member would look identical.
  const beforeStreak = available.slice(0, Math.max(0, available.length - target - 1))
  // How far they got before falling away, which is what the drop-off chart is of.
  const persistence = 0.25 + random() * 0.7
  const early = beforeStreak.slice(0, Math.round(beforeStreak.length * persistence))

  const items = [...early, ...streakDays].map((d) => ({
    client_id: crypto.randomUUID(),
    entity: 'completion',
    op: 'upsert',
    payload: {
      devotion_day_id: d.id,
      client_completed_at: `${d.scheduled_date}T${partOfDay === 'night' ? '21' : '07'}:20:00+03:00`,
      reading_seconds: 150 + Math.floor(random() * 180),
      scroll_depth: 1,
      confirmed_early: false,
    },
  }))

  // Roughly a third of readers write something; the dashboard only ever counts these.
  const reflective = random() < 0.34
  if (reflective) {
    for (const d of [...early, ...streakDays].slice(-2)) {
      items.push({
        client_id: crypto.randomUUID(),
        entity: 'reflection',
        payload: {
          devotion_day_id: d.id,
          question_ordinal: 0,
          body: 'Mock reflection — seeded for local review.',
          updated_at: new Date().toISOString(),
        },
      })
    }
  }

  const result = items.length
    ? await json(
        await fetch(`${URL}/rest/v1/rpc/sync_outbox`, {
          method: 'POST',
          headers: H,
          body: JSON.stringify({ p_items: items }),
        }),
      )
    : { applied: 0, streak: { current: 0 } }

  // A minority mute a rung or two, so the opt-out table has something to say.
  const mutes = []
  if (random() < 0.3) mutes.push('streak_lost')
  if (random() < 0.24) mutes.push('comeback_d3')
  if (random() < 0.18) mutes.push('streak_at_risk')
  if (random() < 0.1) mutes.push('daily_reminder')
  if (mutes.length) {
    await fetch(`${URL}/rest/v1/notification_prefs`, {
      method: 'POST',
      headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(
        mutes.map((kind) => ({ user_id: session.user.id, kind, enabled: false })),
      ),
    })
  }

  made++
  console.log(
    `  ${returning ? 'upd' : 'new'} ${name.padEnd(20)} ${language}  joined ${joinedOn}  ` +
      `${String(result.applied ?? 0).padStart(2)} day(s)  streak ${result.streak?.current ?? 0}` +
      `${mutes.length ? `  muted ${mutes.length}` : ''}`,
  )

  // Local GoTrue rate-limits bursts of signups; this keeps well under it.
  await new Promise((r) => setTimeout(r, 120))
}

console.log(`\nseeded ${made} member(s)${failed ? `, ${failed} failed` : ''}`)
console.log(`password for all of them: ${PASSWORD}`)
