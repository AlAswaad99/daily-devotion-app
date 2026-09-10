import {
  computeStreak, type CompletionMethod, type IsoDate, type LibraryDay, type ScriptureRef,
  type StreakSummary,
} from '@abide/domain'
import { getDatabase, getMeta, META_STREAK, META_TODAY } from '../db/database'
import { BOOKS_SQL, LIBRARY_DAYS_SQL } from './queries'
import { enqueue } from '../sync/outbox'
import { syncNow } from '../sync/sync'
import { log } from '../lib/log'

/**
 * Everything the screens read comes from here, and here reads only the local
 * database. No screen waits on the network — a write lands locally, shows
 * immediately, and reaches the server whenever there is one.
 */

export interface LocalDay {
  id: string
  book_id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  topic_am: string
  purpose_en: string
  purpose_am: string
  prayer_en: string
  prayer_am: string
  passage: ScriptureRef | null
  key_verses: ScriptureRef[]
  cross_refs: ScriptureRef[]
  expected_seconds: number
  scheduled_date: string
  /** Scheduled after today: purpose/prayer/passage are empty, nothing to read yet. */
  locked: boolean
  book_title_en?: string
  book_title_am?: string
  phase_code?: string
  round_code?: string
  main_verse_en?: string
  main_verse_am?: string
}

interface RawDay extends Omit<LocalDay, 'passage' | 'key_verses' | 'cross_refs' | 'locked'> {
  passage: string | null
  key_verses: string
  cross_refs: string
  locked: number
}

const hydrate = (row: RawDay): LocalDay => ({
  ...row,
  passage: row.passage ? (JSON.parse(row.passage) as ScriptureRef) : null,
  key_verses: JSON.parse(row.key_verses ?? '[]') as ScriptureRef[],
  cross_refs: JSON.parse(row.cross_refs ?? '[]') as ScriptureRef[],
  locked: Boolean(row.locked),
})

const DAY_COLUMNS = `
  d.id, d.book_id, d.day_number, d.kind, d.topic_en, d.topic_am, d.purpose_en,
  d.purpose_am, d.prayer_en, d.prayer_am, d.passage, d.key_verses, d.cross_refs,
  d.expected_seconds, d.scheduled_date, d.locked,
  b.title_en as book_title_en, b.title_am as book_title_am,
  r.phase_code, r.round_code, r.main_verse_en, r.main_verse_am
`

export async function ministryToday(): Promise<string | null> {
  return getMeta(META_TODAY)
}

export interface ServerStreak {
  current: number
  best: number
  last_counted_date: string | null
  repair_credits: number
}

/**
 * The server's last word on the streak. The current count is recomputed locally so
 * it is right offline, but `best` and `repair_credits` are the server's to know.
 */
export async function serverStreak(): Promise<ServerStreak | null> {
  const raw = await getMeta(META_STREAK)
  return raw ? (JSON.parse(raw) as ServerStreak) : null
}

/**
 * How much content is cached locally. "No day for today" and "no content at all"
 * are different situations and must not be shown as the same thing: one means the
 * round has finished, the other means this phone has never managed a sync.
 */
export async function contentCounts(): Promise<{ days: number; books: number; rounds: number }> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ days: number; books: number; rounds: number }>(
    `select (select count(*) from devotion_days) as days,
            (select count(*) from books) as books,
            (select count(*) from rounds) as rounds`,
  )
  return row ?? { days: 0, books: 0, rounds: 0 }
}

export async function getDayForDate(date: string): Promise<LocalDay | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<RawDay>(
    `select ${DAY_COLUMNS}
     from devotion_days d
     left join books b on b.id = d.book_id
     left join rounds r on r.id = b.round_id
     where d.scheduled_date = ?`,
    date,
  )
  return row ? hydrate(row) : null
}

export async function getDay(id: string): Promise<LocalDay | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<RawDay>(
    `select ${DAY_COLUMNS}
     from devotion_days d
     left join books b on b.id = d.book_id
     left join rounds r on r.id = b.round_id
     where d.id = ?`,
    id,
  )
  return row ? hydrate(row) : null
}

export async function getSummaryQuestions(bookId: string) {
  const db = await getDatabase()
  return db.getAllAsync<{ ordinal: number; question_en: string; question_am: string }>(
    'select ordinal, question_en, question_am from summary_questions where book_id = ? order by ordinal',
    bookId,
  )
}

export interface LocalCompletion {
  devotion_day_id: string
  method: CompletionMethod
  counted_for_streak: number
  pending: number
}

export async function getCompletion(dayId: string): Promise<LocalCompletion | null> {
  const db = await getDatabase()
  return (
    (await db.getFirstAsync<LocalCompletion>(
      'select devotion_day_id, method, counted_for_streak, pending from day_completions where devotion_day_id = ?',
      dayId,
    )) ?? null
  )
}

export async function getAllCompletions(): Promise<LocalCompletion[]> {
  const db = await getDatabase()
  return db.getAllAsync<LocalCompletion>(
    'select devotion_day_id, method, counted_for_streak, pending from day_completions',
  )
}

export async function getScheduledDays(): Promise<Array<{ id: string; date: IsoDate }>> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ id: string; scheduled_date: string }>(
    'select id, scheduled_date from devotion_days where scheduled_date is not null order by scheduled_date',
  )
  return rows.map((r) => ({ id: r.id, date: r.scheduled_date as IsoDate }))
}

/**
 * The streak, computed locally from local rows. This is the same
 * `computeStreak` the parity test holds against the server's version, so the
 * offline answer and the eventual server answer cannot disagree.
 */
export async function localStreak(joinedOn: string): Promise<StreakSummary | null> {
  const today = await ministryToday()
  if (!today) return null

  const [scheduled, completions] = await Promise.all([getScheduledDays(), getAllCompletions()])
  return computeStreak({
    scheduled,
    completions: completions.map((c) => ({
      devotionDayId: c.devotion_day_id,
      method: c.method,
    })),
    joinedOn: joinedOn as IsoDate,
    today: today as IsoDate,
  })
}

/**
 * Complete a day.
 *
 * Written locally and queued, never awaited on the network. The method recorded
 * here is the client's guess for display; the server decides the real one when the
 * item flushes, and the next pull overwrites this row with its verdict.
 */
export async function completeDay(day: {
  id: string
  scheduledDate: string
  readingSeconds: number
  scrollDepth: number
  confirmedEarly: boolean
}): Promise<void> {
  const db = await getDatabase()
  const today = await ministryToday()
  const guess: CompletionMethod = day.scheduledDate === today ? 'live' : 'backfill'
  const now = new Date().toISOString()

  await db.runAsync(
    `insert into day_completions (devotion_day_id, method, counted_for_streak,
       completed_at, reading_seconds, scroll_depth, pending)
     values (?, ?, ?, ?, ?, ?, 1)
     on conflict(devotion_day_id) do update set
       reading_seconds = max(day_completions.reading_seconds, excluded.reading_seconds),
       scroll_depth = max(day_completions.scroll_depth, excluded.scroll_depth),
       pending = 1`,
    day.id, guess, guess === 'live' ? 1 : 0, now, day.readingSeconds, day.scrollDepth,
  )

  await enqueue('completion', {
    devotion_day_id: day.id,
    // The device's own clock, sent for the server to judge rather than to trust.
    client_completed_at: now,
    reading_seconds: day.readingSeconds,
    scroll_depth: day.scrollDepth,
    confirmed_early: day.confirmedEarly,
  })

  log.info('repository', 'completed day locally', { day: day.id, guess })
  // Fire and forget: if there is no network this is a no-op and the item waits.
  // Forced, because a completion the user just made should not sit out a debounce.
  void syncNow({ force: true })
}

/* ------------------------------------------------------------------ library */

export interface LocalBook {
  id: string
  sequence: number
  title_en: string
  title_am: string
}

export async function getBooks(): Promise<LocalBook[]> {
  const db = await getDatabase()
  // Only books that actually have a visible day. A future book has none, which is
  // what keeps it out of the library without a second rule to get wrong.
  return db.getAllAsync<LocalBook>(BOOKS_SQL)
}

/**
 * Every visible day with the three flags the filters need. One query rather than
 * three, because the library filters across all of them at once.
 */
export async function getLibraryDays(): Promise<LibraryDay[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{
    id: string
    book_id: string
    day_number: number
    kind: 'devotion' | 'summary'
    topic_en: string
    topic_am: string
    purpose_en: string
    purpose_am: string
    scheduled_date: string
    passage: string | null
    locked: number
    completed: number
    reflected: number
    favourite: number
  }>(
    LIBRARY_DAYS_SQL,

  )

  return rows.map((r) => ({
    id: r.id,
    bookId: r.book_id,
    dayNumber: r.day_number,
    kind: r.kind,
    topicEn: r.topic_en,
    topicAm: r.topic_am,
    purposeEn: r.purpose_en,
    purposeAm: r.purpose_am,
    scheduledDate: r.scheduled_date,
    passage: r.passage ? (JSON.parse(r.passage) as ScriptureRef) : null,
    completed: Boolean(r.completed),
    reflected: Boolean(r.reflected),
    favourite: Boolean(r.favourite),
    locked: Boolean(r.locked),
  }))
}

/* -------------------------------------------------------------- reflections */

export interface LocalReflection {
  devotion_day_id: string
  question_ordinal: number
  body: string
  updated_at: string
}

export async function getReflections(dayId: string): Promise<LocalReflection[]> {
  const db = await getDatabase()
  return db.getAllAsync<LocalReflection>(
    `select devotion_day_id, question_ordinal, body, updated_at
     from reflections where devotion_day_id = ? order by question_ordinal`,
    dayId,
  )
}

export interface ReflectionEntry extends LocalReflection {
  topic_en: string
  topic_am: string
  scheduled_date: string
  book_id: string
  book_title_en: string
  book_title_am: string
}

/** Everything the user has written, newest first. Private: never leaves the device
 *  except to their own row on the server, which no admin policy can read. */
export async function listReflections(): Promise<ReflectionEntry[]> {
  const db = await getDatabase()
  return db.getAllAsync<ReflectionEntry>(
    `select r.devotion_day_id, r.question_ordinal, r.body, r.updated_at,
            d.topic_en, d.topic_am, d.scheduled_date,
            b.id as book_id, b.title_en as book_title_en, b.title_am as book_title_am
     from reflections r
     join devotion_days d on d.id = r.devotion_day_id
     join books b on b.id = d.book_id
     where trim(r.body) <> ''
     order by r.updated_at desc`,
  )
}

export async function saveReflection(
  dayId: string,
  questionOrdinal: number,
  body: string,
): Promise<void> {
  const db = await getDatabase()
  const now = new Date().toISOString()

  await db.runAsync(
    `insert into reflections (devotion_day_id, question_ordinal, body, updated_at, pending)
     values (?, ?, ?, ?, 1)
     on conflict(devotion_day_id, question_ordinal) do update set
       body = excluded.body, updated_at = excluded.updated_at, pending = 1`,
    dayId, questionOrdinal, body, now,
  )

  await enqueue('reflection', {
    devotion_day_id: dayId,
    question_ordinal: questionOrdinal,
    body,
    // Conflicts resolve last-write-wins on this, so it must be the moment the user
    // typed rather than the moment the queue happened to flush.
    updated_at: now,
  })
  void syncNow({ force: true })
}

/* ---------------------------------------------------------------- favourites */

export async function isFavourite(dayId: string): Promise<boolean> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ n: number }>(
    'select count(*) as n from favorites where devotion_day_id = ?',
    dayId,
  )
  return (row?.n ?? 0) > 0
}

export async function toggleFavourite(dayId: string): Promise<boolean> {
  const db = await getDatabase()
  const on = await isFavourite(dayId)

  if (on) {
    await db.runAsync('delete from favorites where devotion_day_id = ?', dayId)
    await enqueue('favorite', { devotion_day_id: dayId }, 'delete')
  } else {
    await db.runAsync(
      'insert into favorites (devotion_day_id, pending) values (?, 1) on conflict do nothing',
      dayId,
    )
    await enqueue('favorite', { devotion_day_id: dayId })
  }

  void syncNow({ force: true })
  return !on
}

export interface SeriesStats {
  parts: number
  reflections: number
  /** Distinct calendar days on which something in this series was completed. */
  days: number
}

/**
 * The three numbers the celebration screen shows.
 *
 * `days` counts distinct completion dates rather than completed days, which would
 * only ever restate `parts`. Someone who read four parts in one sitting and the rest
 * across a fortnight should see that, and it is the only one of the three that says
 * anything about how the series was actually walked.
 *
 * Empty reflections do not count. A field that was opened and left blank saves a row
 * like any other, and a celebration claiming reflections nobody wrote is worse than
 * one claiming none.
 */
export async function seriesStats(bookId: string): Promise<SeriesStats> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<SeriesStats>(
    `select
       (select count(*) from devotion_days where book_id = ?1 and kind = 'devotion') as parts,
       (select count(*) from reflections r
          join devotion_days d on d.id = r.devotion_day_id
          where d.book_id = ?1 and trim(r.body) <> '') as reflections,
       (select count(distinct date(dc.completed_at)) from day_completions dc
          join devotion_days d on d.id = dc.devotion_day_id
          where d.book_id = ?1 and dc.completed_at is not null) as days`,
    bookId,
  )
  return row ?? { parts: 0, reflections: 0, days: 0 }
}
