import type { Language, MinuteOfDay, PartOfDay, StreakSummary } from '@abide/domain'
import { GREETINGS, MOTIVATIONS } from './i18n'
import { getMeta, setMeta } from '../db/database'

/**
 * The parts of the v3 prototype's logic class the app did not already have.
 *
 * The Ethiopian calendar and clock are **not** here: `@abide/domain` implements both
 * against kenat and the database's own `part_of_day_for`, with tests, and duplicating
 * the prototype's JDN arithmetic to satisfy the wording of the handoff would give the
 * app two answers to the same question. `packages/domain/test/ethiopic.test.ts` proves
 * the two agree.
 *
 * What is ported here is everything else the prototype decides: which greeting and
 * motivation line to show, which part of day the hero is dressed for, whether the
 * reminder window is open, and how the streak reads as a mood.
 */

/**
 * The hero's part of day, from the device clock.
 *
 * These boundaries are the prototype's (`autoKey`), and they are deliberately not the
 * ones in `partOfDayForMinute`. That function mirrors a database trigger and decides
 * when someone's *reminder* fires; this decides which sky to paint at the moment they
 * opened the app. A member reading at 5:30 in the morning should see a sunrise even
 * though their reminder window would still call that night.
 */
export const heroPartOfDay = (date = new Date()): PartOfDay => {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 21) return 'evening'
  return 'night'
}

/** Evening is the one sky bright enough that ink text reads better than paper text. */
export const heroTextIsDark = (part: PartOfDay): boolean => part === 'evening'

/**
 * A stable index into a list of n, seeded on a string.
 *
 * The prototype picks `Math.random()` once per mount, which in React Native would mean
 * a different greeting every time the tab is focused. Seeding on the ministry date
 * gives the same variety across days with none of the flicker within one.
 */
function seededIndex(seed: string, n: number): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % n
}

export function greetingFor(
  part: PartOfDay,
  language: Language,
  seed: string,
): string {
  const options = GREETINGS[language][part]
  return options[seededIndex(`g:${seed}`, options.length)] ?? options[0]!
}

export function motivationFor(language: Language, seed: string): string {
  const options = MOTIVATIONS[language]
  return options[seededIndex(`m:${seed}`, options.length)] ?? options[0]!
}

/**
 * Is the member inside their devotion window right now?
 *
 * `(nowMin − remMin + 1440) % 1440 < remDur`, from the prototype. The modulo is what
 * makes a window that crosses midnight work: 23:30 for an hour is open at 00:15.
 */
export function windowIsOpen(
  start: MinuteOfDay,
  duration: number,
  now = new Date(),
): boolean {
  const nowMin = now.getHours() * 60 + now.getMinutes()
  return (nowMin - start + 1440) % 1440 < duration
}

/**
 * Whether to show the arrival signal: inside the window, not yet begun, streak alive.
 *
 * The prototype also suppresses it when the streak is out, and that is worth keeping —
 * someone who has lost their streak is met by a sad mascot, and a lantern celebrating
 * the hour on top of that reads as tone-deaf.
 */
export function reminderArrived(input: {
  remindersOn: boolean
  start: MinuteOfDay
  duration: number
  begunToday: boolean
  streak: StreakState
  now?: Date
}): boolean {
  if (!input.remindersOn || input.begunToday || input.streak === 'out') return false
  return windowIsOpen(input.start, input.duration, input.now ?? new Date())
}

export type StreakState = 'strong' | 'low' | 'out'

/**
 * The streak as a mood, for the mascot and the flame.
 *
 * The prototype hardcodes three sample states. Mapping them onto a real record: a live
 * streak is strong, a streak that has just broken but is still repairable is fading,
 * and one with nothing behind it is out. The boundary is the repair window rather than
 * a day count, because that is the moment the app stops being able to offer a way back.
 */
export function streakState(streak: StreakSummary | null): StreakState {
  if (!streak || streak.current === 0) {
    /*
     * A member who has never read is not "out" — nothing has gone out. But the design
     * has no fourth state, and a sad mascot is the wrong greeting for day one, so a
     * fresh account reads as fading rather than extinguished.
     */
    return streak && streak.missedDates.length > 0 ? 'out' : 'low'
  }
  return 'strong'
}

/** Consecutive missed days ending yesterday — what the fading and out copy counts. */
export function missedRun(streak: StreakSummary | null, today: string | null): number {
  if (!streak || !today) return 0
  const missed = new Set<string>(streak.missedDates)
  let run = 0
  const cursor = new Date(`${today}T00:00:00Z`)
  for (;;) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
    const iso = cursor.toISOString().slice(0, 10)
    if (!missed.has(iso)) break
    run++
    if (run > 400) break
  }
  return run
}

/**
 * "Begin study" pressed today.
 *
 * Local and keyed on the ministry date, so it resets itself at the day boundary with
 * no clean-up and no sync. It drives one visual — whether the arrival signal is still
 * showing — and losing it on reinstall costs nothing.
 */
const begunKey = (ministryDate: string) => `abide.begun.${ministryDate}`

export async function hasBegunToday(ministryDate: string | null): Promise<boolean> {
  if (!ministryDate) return false
  return (await getMeta(begunKey(ministryDate))) === '1'
}

export async function markBegunToday(ministryDate: string | null): Promise<void> {
  if (!ministryDate) return
  await setMeta(begunKey(ministryDate), '1')
}
