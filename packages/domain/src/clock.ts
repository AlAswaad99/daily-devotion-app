import type { Language, PartOfDay } from './enums.ts'

/**
 * The Ethiopian clock, for display.
 *
 * The day starts at dawn rather than midnight, so six in the morning is twelve
 * o'clock and one in the afternoon is seven. Everything stored — `reminder_at`, the
 * notification schedule, every timestamp — stays on the 24-hour clock; conversion
 * happens here, at the edge, the same way Gregorian dates are stored and Ethiopian
 * dates rendered in `ethiopic.ts`.
 */

/** Minutes after midnight. The unit the pickers step in. */
export type MinuteOfDay = number

export const DAY_MINUTES = 1440
export const STEP_MINUTES = 15
export const MIN_DURATION = 15
export const MAX_DURATION = 120

/**
 * Part of day from a 24-hour hour.
 *
 * **This mirrors `part_of_day_for(time)` in the database, which is the owner.** The
 * column is derived by a trigger there so the two cannot drift on write; this copy
 * exists only so the picker can show the right card before anything is saved. If the
 * boundaries move, they move in the migration first.
 */
export const partOfDayForMinute = (minute: MinuteOfDay): PartOfDay => {
  const hour = Math.floor(normaliseMinute(minute) / 60)
  if (hour >= 6 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 21) return 'evening'
  return 'night'
}

/** Where each part of day begins, in minutes after midnight. */
export const PART_STARTS: Record<PartOfDay, MinuteOfDay> = {
  morning: 6 * 60,
  afternoon: 12 * 60,
  evening: 18 * 60,
  night: 21 * 60,
}

/** Wraps rather than clamps: nudging back from 00:00 lands on 23:45. */
export const normaliseMinute = (minute: MinuteOfDay): MinuteOfDay =>
  ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES

/**
 * The Ethiopian hour for a 24-hour hour: 6am is 12, 7am is 1, and so on round to 12.
 * The `|| 12` is what turns a zero into the twelve that Ethiopian counting uses.
 */
export const ethiopicHour = (hour24: number): number => ((hour24 - 6 + 24) % 12) || 12

/** "12:00" — Ethiopian hour, real minutes, Arabic numerals in both languages. */
export const formatEthiopicClock = (minute: MinuteOfDay): string => {
  const m = normaliseMinute(minute)
  return `${ethiopicHour(Math.floor(m / 60))}:${String(m % 60).padStart(2, '0')}`
}

const PERIOD_WORDS: Record<PartOfDay, Record<Language, string>> = {
  morning: { en: 'morning', am: 'ጠዋት' },
  afternoon: { en: 'afternoon', am: 'ከሰዓት' },
  evening: { en: 'evening', am: 'ማታ' },
  night: { en: 'night', am: 'ሌሊት' },
}

export const periodWord = (part: PartOfDay, language: Language): string =>
  PERIOD_WORDS[part][language]

/** `time (hours) → 'time'`, so "1½ hours" reads as a phrase rather than "90 min". */
export const formatDuration = (minutes: number, language: Language): string => {
  if (minutes < 60) return language === 'am' ? `${minutes} ደቂቃ` : `${minutes} min`
  const hours = minutes / 60
  const word = language === 'am' ? 'ሰዓት' : hours === 1 ? 'hour' : 'hours'
  const label = hours === 1 ? '1' : hours === 1.5 ? '1½' : String(hours)
  return `${label} ${word}`
}

/**
 * The window as one line: "12:00 – 12:30 ጠዋት".
 *
 * A window may start in one period and end in another — 11:30 in the morning running
 * half an hour lands in the afternoon — and when it does, both words are shown rather
 * than picking one and being wrong for half the window.
 */
export const formatWindow = (
  start: MinuteOfDay,
  duration: number,
  language: Language,
): string => {
  const end = normaliseMinute(start + duration)
  const startPart = partOfDayForMinute(start)
  const endPart = partOfDayForMinute(end)
  const from = formatEthiopicClock(start)
  const to = formatEthiopicClock(end)

  return startPart === endPart
    ? `${from} – ${to} ${periodWord(startPart, language)}`
    : `${from} ${periodWord(startPart, language)} – ${to} ${periodWord(endPart, language)}`
}

/** "06:00" — for `reminder_at`, which is a SQL `time` and stays on the 24-hour clock. */
export const toSqlTime = (minute: MinuteOfDay): string => {
  const m = normaliseMinute(minute)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
}

export const fromSqlTime = (time: string): MinuteOfDay => {
  const [h, m] = time.split(':').map(Number)
  return normaliseMinute((h ?? 0) * 60 + (m ?? 0))
}
