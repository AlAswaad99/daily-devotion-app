import type { IsoDate } from './ids.ts'
import type { CompletionMethod } from './enums.ts'

/**
 * The streak counts consecutive **scheduled devotion days**, not consecutive
 * calendar days. That one sentence resolves gaps between books, unpublished rounds,
 * and the round boundary all at once: a date with no scheduled day is skipped, not
 * broken.
 *
 * This module is pure and is the client's optimistic answer. The server recomputes
 * the same thing from the same inputs and its answer wins — see
 * `recompute_streak()` in the migrations, which mirrors this algorithm exactly.
 */

export interface ScheduledDay {
  id: string
  date: IsoDate
}

export interface CompletionInput {
  devotionDayId: string
  method: CompletionMethod
}

export interface StreakInput {
  /** Every scheduled day the user can see. Order does not matter. */
  scheduled: ScheduledDay[]
  completions: CompletionInput[]
  /** Days scheduled before this are pre-join: readable, but outside streak math. */
  joinedOn: IsoDate
  /** Today in EAT, never the device's own zone. */
  today: IsoDate
}

export interface StreakSummary {
  current: number
  best: number
  lastCountedDate: IsoDate | null
  /** Scheduled days before today, in range, with no completion that counts. */
  missedDates: IsoDate[]
  todayDayId: string | null
  todayComplete: boolean
}

/** Backfilling marks a day read everywhere it is shown; only these restore a streak. */
export const countsForStreak = (method: CompletionMethod): boolean => method !== 'backfill'

export function computeStreak(input: StreakInput): StreakSummary {
  const { joinedOn, today } = input

  // Pre-join days are excluded from all math, and future days have not happened.
  const days = input.scheduled
    .filter((d) => d.date >= joinedOn && d.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))

  const counted = new Set(
    input.completions.filter((c) => countsForStreak(c.method)).map((c) => c.devotionDayId),
  )

  let best = 0
  let run = 0
  let lastCountedDate: IsoDate | null = null
  const missedDates: IsoDate[] = []

  for (const day of days) {
    if (counted.has(day.id)) {
      run += 1
      best = Math.max(best, run)
      lastCountedDate = day.date
    } else {
      run = 0
      // Today is still open: not completed yet is not the same as missed.
      if (day.date < today) missedDates.push(day.date)
    }
  }

  const todayDay = days.at(-1)?.date === today ? days.at(-1)! : null
  const todayComplete = todayDay !== null && counted.has(todayDay.id)

  // An uncompleted today does not break the streak — the day has not ended.
  const trailing = todayDay !== null && !todayComplete ? days.slice(0, -1) : days
  let current = 0
  for (let i = trailing.length - 1; i >= 0; i--) {
    if (counted.has(trailing[i]!.id)) current += 1
    else break
  }

  return {
    current,
    best,
    lastCountedDate,
    missedDates,
    todayDayId: todayDay?.id ?? null,
    todayComplete,
  }
}
