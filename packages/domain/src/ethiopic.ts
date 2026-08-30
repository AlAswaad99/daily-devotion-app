import { toEC, toGC, monthNames } from 'kenat'
import type { Language } from './enums.ts'

/**
 * Ethiopian calendar for display, Gregorian underneath. Every date stored and
 * reasoned about is Gregorian ISO in EAT; conversion happens only at render.
 *
 * The arithmetic is not hand-rolled — kenat handles the leap rule, including the
 * one that matters here: Meskerem 1 falls on 11 September, or 12 September in the
 * year before a Gregorian leap year.
 */

export interface EthiopicDate {
  year: number
  /** 1–13. Month 13 is Pagume, which has 5 or 6 days. */
  month: number
  day: number
}

export const toEthiopic = (iso: string): EthiopicDate => {
  const [y, m, d] = iso.split('-').map(Number)
  return toEC(y!, m!, d!)
}

export const toIso = (ec: EthiopicDate): string => {
  const g = toGC(ec.year, ec.month, ec.day)
  return `${g.year}-${String(g.month).padStart(2, '0')}-${String(g.day).padStart(2, '0')}`
}

/** Arabic numerals throughout, by decision — not Ge'ez numerals. */
export const monthName = (month: number, language: Language): string => {
  const names = language === 'am' ? monthNames.amharic : monthNames.english
  return names[month - 1] ?? ''
}

export const PAGUME = 13

/**
 * 30 for the first twelve months; 5 or 6 for Pagume, which is 6 in the year before
 * a Gregorian leap year.
 *
 * Measured as the gap between this month's first day and the next month's, so the
 * leap rule stays the library's business rather than something we assert here.
 */
export const daysInEthiopicMonth = (year: number, month: number): number => {
  const start = toGC(year, month, 1)
  const next =
    month === PAGUME ? toGC(year + 1, 1, 1) : toGC(year, month + 1, 1)
  const ms =
    Date.UTC(next.year, next.month - 1, next.day) -
    Date.UTC(start.year, start.month - 1, start.day)
  return Math.round(ms / 86_400_000)
}

export interface MonthCell {
  iso: string
  ethiopicDay: number
}

/**
 * The days of one Ethiopian month, in order. There is no week-grid padding: the
 * Ethiopian month is twelve tidy 30-day months plus Pagume, so the streak grid lays
 * them out as rows of the calendar's own shape and lets Pagume be a short partial
 * row rather than padding it to a full week.
 */
export const ethiopicMonthDays = (year: number, month: number): MonthCell[] =>
  Array.from({ length: daysInEthiopicMonth(year, month) }, (_, i) => ({
    iso: toIso({ year, month, day: i + 1 }),
    ethiopicDay: i + 1,
  }))

export const formatEthiopic = (iso: string, language: Language): string => {
  const ec = toEthiopic(iso)
  return `${monthName(ec.month, language)} ${ec.day}, ${ec.year}`
}
