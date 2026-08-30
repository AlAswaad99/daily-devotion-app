import {
  computeStreak, type CompletionMethod, type IsoDate, type ScriptureRef, type StreakSummary,
} from '@abide/domain'
import { getDatabase, getMeta, META_STREAK, META_TODAY } from '../db/database'
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
  book_title_en?: string
  book_title_am?: string
  phase_code?: string
  round_code?: string
  main_verse_en?: string
  main_verse_am?: string
}

interface RawDay extends Omit<LocalDay, 'passage' | 'key_verses' | 'cross_refs'> {
  passage: string | null
  key_verses: string
  cross_refs: string
}

const hydrate = (row: RawDay): LocalDay => ({
  ...row,
  passage: row.passage ? (JSON.parse(row.passage) as ScriptureRef) : null,
  key_verses: JSON.parse(row.key_verses ?? '[]') as ScriptureRef[],
  cross_refs: JSON.parse(row.cross_refs ?? '[]') as ScriptureRef[],
})

const DAY_COLUMNS = `
  d.id, d.book_id, d.day_number, d.kind, d.topic_en, d.topic_am, d.purpose_en,
  d.purpose_am, d.prayer_en, d.prayer_am, d.passage, d.key_verses, d.cross_refs,
  d.expected_seconds, d.scheduled_date,
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

export async function getDayForDate(date: string): Promise<LocalDay | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<RawDay>(
    `select ${DAY_COLUMNS}
     from devotion_days d
     join books b on b.id = d.book_id
     join rounds r on r.id = b.round_id
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
     join books b on b.id = d.book_id
     join rounds r on r.id = b.round_id
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
  void syncNow()
}
