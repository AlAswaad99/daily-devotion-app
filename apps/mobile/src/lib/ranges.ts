import type { StringKey } from './i18n'

/**
 * The date-range filter, shared by the library and the journal.
 *
 * Both screens draw the same six chips and mean the same thing by them, so the list and
 * the predicate live in one place. The filter compares the *devotion's* scheduled date
 * rather than when anything was written or read: the date on a card and the date the
 * filter uses have to be the same date, or a card dated last spring turns up under
 * "last month".
 */
export const RANGES = [
  'rangeAll',
  'rangeMonth',
  'range3',
  'range6',
  'rangeYear',
  'rangeCustom',
] as const satisfies readonly StringKey[]

export type RangeKey = (typeof RANGES)[number]

const MONTHS_BACK: Record<RangeKey, number | null> = {
  rangeAll: null,
  rangeMonth: 1,
  range3: 3,
  range6: 6,
  rangeYear: 12,
  rangeCustom: null,
}

/** `YYYY-MM-DD` only. A half-typed date filters nothing rather than filtering wrongly. */
const isIso = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

export function inRange(date: string, range: RangeKey, from = '', to = ''): boolean {
  if (range === 'rangeAll') return true

  if (range === 'rangeCustom') {
    if (isIso(from) && date < from) return false
    if (isIso(to) && date > to) return false
    return true
  }

  const months = MONTHS_BACK[range]
  if (months === null) return true
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  return date >= cutoff.toISOString().slice(0, 10)
}
