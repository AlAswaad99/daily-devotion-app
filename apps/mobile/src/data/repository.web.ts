import {
  computeStreak, type CompletionMethod, type IsoDate, type LibraryDay, type ScriptureRef,
  type StreakSummary,
} from '@abide/domain'
import { getStore, applyOutboxItem, type Row } from '../db/webStore'
import { log } from '../lib/log'

/**
 * The web twin of `repository.ts`. Same exported shapes, so no screen needs to know
 * which one it is calling — but there is no local database underneath: reads come
 * from the in-memory `webStore` cache and writes go straight to `sync_outbox`
 * (see `db/webStore.ts` for why that is the right substitute for the outbox+SQLite
 * pair the native app uses).
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
  locked: boolean
  book_title_en?: string
  book_title_am?: string
  phase_code?: string
  round_code?: string
  main_verse_en?: string
  main_verse_am?: string
}

/** jsonb columns arrive already parsed from Supabase, unlike SQLite's JSON-as-text. */
function hydrateDay(d: Row, books: Row[], rounds: Row[]): LocalDay {
  const book = books.find((b) => b.id === d.book_id)
  const round = book ? rounds.find((r) => r.id === book.round_id) : undefined
  return {
    id: d.id as string,
    book_id: d.book_id as string,
    day_number: d.day_number as number,
    kind: d.kind as LocalDay['kind'],
    topic_en: d.topic_en as string,
    topic_am: d.topic_am as string,
    // A locked day's payload omits these — never undefined here, same as the
    // native path, so nothing downstream has to know locked rows are shaped
    // differently before it is safe to read a field.
    purpose_en: (d.purpose_en as string | undefined) ?? '',
    purpose_am: (d.purpose_am as string | undefined) ?? '',
    prayer_en: (d.prayer_en as string | undefined) ?? '',
    prayer_am: (d.prayer_am as string | undefined) ?? '',
    passage: (d.passage as ScriptureRef | null) ?? null,
    key_verses: (d.key_verses as ScriptureRef[] | null) ?? [],
    cross_refs: (d.cross_refs as ScriptureRef[] | null) ?? [],
    expected_seconds: (d.expected_seconds as number | undefined) ?? 0,
    scheduled_date: d.scheduled_date as string,
    locked: Boolean(d.locked),
    ...(book?.title_en !== undefined ? { book_title_en: book.title_en as string } : {}),
    ...(book?.title_am !== undefined ? { book_title_am: book.title_am as string } : {}),
    ...(round?.phase_code !== undefined ? { phase_code: round.phase_code as string } : {}),
    ...(round?.round_code !== undefined ? { round_code: round.round_code as string } : {}),
    ...(round?.main_verse_en !== undefined
      ? { main_verse_en: round.main_verse_en as string }
      : {}),
    ...(round?.main_verse_am !== undefined
      ? { main_verse_am: round.main_verse_am as string }
      : {}),
  }
}

export async function ministryToday(): Promise<string | null> {
  return (await getStore()).today
}

export interface ServerStreak {
  current: number
  best: number
  last_counted_date: string | null
  repair_credits: number
}

export async function serverStreak(): Promise<ServerStreak | null> {
  return ((await getStore()).streak as unknown as ServerStreak | null) ?? null
}

export async function contentCounts(): Promise<{ days: number; books: number; rounds: number }> {
  const s = await getStore()
  return { days: s.days.length, books: s.books.length, rounds: s.rounds.length }
}

export async function getDayForDate(date: string): Promise<LocalDay | null> {
  const s = await getStore()
  const row = s.days.find((d) => d.scheduled_date === date)
  return row ? hydrateDay(row, s.books, s.rounds) : null
}

export async function getDay(id: string): Promise<LocalDay | null> {
  const s = await getStore()
  const row = s.days.find((d) => d.id === id)
  return row ? hydrateDay(row, s.books, s.rounds) : null
}

export async function getSummaryQuestions(bookId: string) {
  const s = await getStore()
  return s.summaryQuestions
    .filter((q) => q.book_id === bookId)
    .sort((a, b) => (a.ordinal as number) - (b.ordinal as number))
    .map((q) => ({
      ordinal: q.ordinal as number,
      question_en: q.question_en as string,
      question_am: q.question_am as string,
    }))
}

export interface LocalCompletion {
  devotion_day_id: string
  method: CompletionMethod
  counted_for_streak: number
  pending: number
}

const toCompletion = (r: Row): LocalCompletion => ({
  devotion_day_id: r.devotion_day_id as string,
  method: r.method as CompletionMethod,
  counted_for_streak: r.counted_for_streak ? 1 : 0,
  pending: 0,
})

export async function getCompletion(dayId: string): Promise<LocalCompletion | null> {
  const s = await getStore()
  const row = s.completions.get(dayId)
  return row ? toCompletion(row) : null
}

export async function getAllCompletions(): Promise<LocalCompletion[]> {
  const s = await getStore()
  return Array.from(s.completions.values()).map(toCompletion)
}

export async function getScheduledDays(): Promise<Array<{ id: string; date: IsoDate }>> {
  const s = await getStore()
  return s.days
    .filter((d) => d.scheduled_date)
    .map((d) => ({ id: d.id as string, date: d.scheduled_date as IsoDate }))
}

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

export async function completeDay(day: {
  id: string
  scheduledDate: string
  readingSeconds: number
  scrollDepth: number
  confirmedEarly: boolean
}): Promise<void> {
  const s = await getStore()
  const guess: CompletionMethod = day.scheduledDate === s.today ? 'live' : 'backfill'
  const now = new Date().toISOString()

  const result = await applyOutboxItem('completion', {
    devotion_day_id: day.id,
    client_completed_at: now,
    reading_seconds: day.readingSeconds,
    scroll_depth: day.scrollDepth,
    confirmed_early: day.confirmedEarly,
  })

  // Optimistic: the server just accepted this, so reflect its shape locally rather
  // than waiting on a full refetch to unblock the screen that just wrote it.
  s.completions.set(day.id, {
    devotion_day_id: day.id,
    method: guess,
    counted_for_streak: guess === 'live' ? 1 : 0,
    completed_at: now,
  })
  if (result.streak) s.streak = result.streak

  log.info('repository', 'completed day', { day: day.id, guess })
}

/* ------------------------------------------------------------------ library */

export interface LocalBook {
  id: string
  sequence: number
  title_en: string
  title_am: string
}

export async function getBooks(): Promise<LocalBook[]> {
  const s = await getStore()
  const withDays = new Set(s.days.map((d) => d.book_id as string))
  return s.books
    .filter((b) => withDays.has(b.id as string))
    .sort((a, b) => (a.sequence as number) - (b.sequence as number))
    .map((b) => ({
      id: b.id as string,
      sequence: b.sequence as number,
      title_en: b.title_en as string,
      title_am: b.title_am as string,
    }))
}

export async function getLibraryDays(): Promise<LibraryDay[]> {
  const s = await getStore()
  const reflected = new Set(
    s.reflections
      .filter((r) => String(r.body ?? '').trim() !== '')
      .map((r) => r.devotion_day_id as string),
  )

  return s.days
    .filter((d) => d.scheduled_date)
    .sort((a, b) => String(b.scheduled_date).localeCompare(String(a.scheduled_date)))
    .map((d) => ({
      id: d.id as string,
      bookId: d.book_id as string,
      dayNumber: d.day_number as number,
      kind: d.kind as LibraryDay['kind'],
      topicEn: d.topic_en as string,
      topicAm: d.topic_am as string,
      purposeEn: (d.purpose_en as string | undefined) ?? '',
      purposeAm: (d.purpose_am as string | undefined) ?? '',
      scheduledDate: d.scheduled_date as string,
      passage: (d.passage as ScriptureRef | null) ?? null,
      completed: s.completions.has(d.id as string),
      reflected: reflected.has(d.id as string),
      favourite: s.favorites.has(d.id as string),
      locked: Boolean(d.locked),
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
  const s = await getStore()
  return s.reflections
    .filter((r) => r.devotion_day_id === dayId)
    .sort((a, b) => (a.question_ordinal as number) - (b.question_ordinal as number))
    .map((r) => ({
      devotion_day_id: r.devotion_day_id as string,
      question_ordinal: r.question_ordinal as number,
      body: r.body as string,
      updated_at: r.updated_at as string,
    }))
}

export interface ReflectionEntry extends LocalReflection {
  topic_en: string
  topic_am: string
  scheduled_date: string
  book_id: string
  book_title_en: string
  book_title_am: string
}

export async function listReflections(): Promise<ReflectionEntry[]> {
  const s = await getStore()
  const entries: ReflectionEntry[] = []

  for (const r of s.reflections) {
    if (String(r.body ?? '').trim() === '') continue
    const day = s.days.find((d) => d.id === r.devotion_day_id)
    if (!day) continue
    const book = s.books.find((b) => b.id === day.book_id)
    if (!book) continue

    entries.push({
      devotion_day_id: r.devotion_day_id as string,
      question_ordinal: r.question_ordinal as number,
      body: r.body as string,
      updated_at: r.updated_at as string,
      topic_en: day.topic_en as string,
      topic_am: day.topic_am as string,
      scheduled_date: day.scheduled_date as string,
      book_id: book.id as string,
      book_title_en: book.title_en as string,
      book_title_am: book.title_am as string,
    })
  }

  return entries.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export async function saveReflection(
  dayId: string,
  questionOrdinal: number,
  body: string,
): Promise<void> {
  const s = await getStore()
  const now = new Date().toISOString()

  await applyOutboxItem('reflection', {
    devotion_day_id: dayId,
    question_ordinal: questionOrdinal,
    body,
    updated_at: now,
  })

  const existing = s.reflections.find(
    (r) => r.devotion_day_id === dayId && r.question_ordinal === questionOrdinal,
  )
  if (existing) {
    existing.body = body
    existing.updated_at = now
  } else {
    s.reflections.push({ devotion_day_id: dayId, question_ordinal: questionOrdinal, body, updated_at: now })
  }
}

/* ---------------------------------------------------------------- favourites */

export async function isFavourite(dayId: string): Promise<boolean> {
  return (await getStore()).favorites.has(dayId)
}

export async function toggleFavourite(dayId: string): Promise<boolean> {
  const s = await getStore()
  const on = s.favorites.has(dayId)

  await applyOutboxItem('favorite', { devotion_day_id: dayId }, on ? 'delete' : 'upsert')

  if (on) s.favorites.delete(dayId)
  else s.favorites.add(dayId)

  return !on
}

export interface SeriesStats {
  parts: number
  reflections: number
  days: number
}

export async function seriesStats(bookId: string): Promise<SeriesStats> {
  const s = await getStore()
  const bookDayIds = new Set(
    s.days.filter((d) => d.book_id === bookId && d.kind === 'devotion').map((d) => d.id as string),
  )

  const reflectionCount = s.reflections.filter(
    (r) => bookDayIds.has(r.devotion_day_id as string) && String(r.body ?? '').trim() !== '',
  ).length

  const completionDates = new Set<string>()
  for (const [dayId, completion] of s.completions) {
    if (!bookDayIds.has(dayId)) continue
    const completedAt = completion.completed_at as string | undefined
    if (completedAt) completionDates.add(completedAt.slice(0, 10))
  }

  return { parts: bookDayIds.size, reflections: reflectionCount, days: completionDates.size }
}
