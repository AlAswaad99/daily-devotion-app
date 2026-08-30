/**
 * Import the ministry's devotion JSONs into the database.
 *
 * Idempotent: every write is keyed on a natural key (round by phase+round code,
 * book by sequence, day by book+day number), so re-running updates in place rather
 * than duplicating. That matters because content will be re-imported every time the
 * ministry corrects a reference.
 *
 * This is a build tool, not the app, and it is the only thing in the repo that uses
 * the service-role key. Neither app has one, by design.
 *
 *   pnpm --filter @abide/content import -- --start=2026-08-01
 *   pnpm --filter @abide/content import -- --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import { scheduleDays } from '../src/import.ts'
import { loadAll } from './validate-content.ts'

const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]

const dryRun = process.argv.includes('--dry-run')

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

/**
 * Default start: far enough back that today falls inside the round, so a fresh
 * database has a Today, a backlog to browse, and future days to stay hidden.
 */
const defaultStart = () => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 30)
  return d.toISOString().slice(0, 10)
}

const startsOn = arg('start') ?? defaultStart()

const { books, issues, metadata } = await loadAll()
const schedule = scheduleDays(books, startsOn)

console.log(`round ${metadata.phase}/${metadata.round} starting ${startsOn}`)
console.log(`${books.length} books, ${schedule.size} scheduled days, ${issues.length} open issues`)

if (dryRun) {
  for (const b of books) {
    const first = schedule.get(`${b.sourceId}#${b.days[0]!.dayNumber}`)
    const last = schedule.get(`${b.sourceId}#${b.days.at(-1)!.dayNumber}`)
    console.log(`  ${b.sourceId} ${b.titleEn}: ${b.days.length} days, ${first} .. ${last}`)
  }
  process.exit(0)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })

const one = <T>(rows: T[] | null, what: string): T => {
  const row = rows?.[0]
  if (!row) throw new Error(`expected a ${what} row back`)
  return row
}

// The church and ministry come from the seed; find them rather than inventing a
// second one, so a re-import never forks tenancy.
const { data: ministries, error: ministryError } = await db
  .from('ministries')
  .select('id, church_id')
  .limit(1)
if (ministryError) throw ministryError
const ministry = one(ministries, 'ministry')

const { data: rounds, error: roundError } = await db
  .from('rounds')
  .upsert(
    {
      church_id: ministry.church_id,
      ministry_id: ministry.id,
      phase_code: metadata.phase,
      round_code: metadata.round,
      main_verse_en: metadata.main_verse.en,
      main_verse_am: metadata.main_verse.am,
      starts_on: startsOn,
      status: 'published',
    },
    { onConflict: 'ministry_id,phase_code,round_code' },
  )
  .select('id')
if (roundError) throw roundError
const round = one(rounds, 'round')

// Scheduled dates are unique per church, so a re-import that shifts the calendar
// would collide with the rows it is about to replace. Clear this round's schedule
// first; the upserts below set it again.
const { data: existingBooks } = await db.from('books').select('id').eq('round_id', round.id)
if (existingBooks?.length) {
  const ids = existingBooks.map((b) => b.id)
  const { error: clearError } = await db
    .from('devotion_days')
    .update({ scheduled_date: null })
    .in('book_id', ids)
  if (clearError) throw clearError
}

let dayCount = 0

for (const book of books) {
  const { data: bookRows, error: bookError } = await db
    .from('books')
    .upsert(
      {
        church_id: ministry.church_id,
        round_id: round.id,
        sequence: book.sequence,
        source_id: book.sourceId,
        title_en: book.titleEn,
        title_am: book.titleAm,
        status: 'published',
        published_at: new Date().toISOString(),
      },
      { onConflict: 'round_id,sequence' },
    )
    .select('id')
  if (bookError) throw bookError
  const bookId = one(bookRows, 'book').id

  const rows = book.days.map((d) => ({
    church_id: ministry.church_id,
    book_id: bookId,
    day_number: d.dayNumber,
    kind: d.kind,
    topic_en: d.topicEn,
    topic_am: d.topicAm,
    purpose_en: d.purposeEn,
    purpose_am: d.purposeAm,
    prayer_en: d.prayerEn,
    prayer_am: d.prayerAm,
    passage: d.passage,
    key_verses: d.keyVerses,
    cross_refs: d.crossRefs,
    passage_raw: d.passageRaw,
    key_verses_raw: d.keyVersesRaw,
    cross_refs_raw: d.crossRefsRaw,
    expected_seconds: d.expectedSeconds,
    scheduled_date: schedule.get(`${book.sourceId}#${d.dayNumber}`) ?? null,
    status: 'published',
  }))

  const { error: dayError } = await db
    .from('devotion_days')
    .upsert(rows, { onConflict: 'book_id,day_number' })
  if (dayError) throw dayError
  dayCount += rows.length

  if (book.summaryQuestions.length) {
    const { error: qError } = await db.from('summary_questions').upsert(
      book.summaryQuestions.map((q) => ({
        church_id: ministry.church_id,
        book_id: bookId,
        ordinal: q.ordinal,
        question_en: q.questionEn,
        question_am: q.questionAm,
      })),
      { onConflict: 'book_id,ordinal' },
    )
    if (qError) throw qError
  }

  console.log(`  ${book.sourceId} ${book.titleEn}: ${rows.length} days`)
}

console.log(`imported ${books.length} books and ${dayCount} days into round ${round.id}`)
if (issues.length) {
  console.log(
    `${issues.length} references still need a ministry decision — see docs/content-report.md`,
  )
}
