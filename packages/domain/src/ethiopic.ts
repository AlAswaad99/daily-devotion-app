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

/**
 * Gregorian month abbreviations, for the secondary line under an Ethiopian month.
 *
 * The Amharic set is transliterated rather than translated: these name the Gregorian
 * months, and an Amharic reader looking for the Gregorian equivalent of ነሐሴ is looking
 * for "ኦገስት", not for a second Ethiopian name.
 */
const GREGORIAN_SHORT: Record<Language, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  am: [
    'ጃንዩ', 'ፌብሩ', 'ማርች', 'ኤፕሪ', 'ሜይ', 'ጁን',
    'ጁላይ', 'ኦገስ', 'ሴፕቴ', 'ኦክቶ', 'ኖቬም', 'ዲሴም',
  ],
}

/**
 * The Gregorian span an Ethiopian month covers: "Aug 7 – Sep 5, 2026".
 *
 * An Ethiopian month never lines up with a Gregorian one, so the streak header carries
 * both — the Ethiopian name is what the month *is*, and this is where to find it on the
 * calendar on the wall. The year is printed once when the span does not cross one.
 */
export const gregorianRange = (year: number, month: number, language: Language): string => {
  const days = ethiopicMonthDays(year, month)
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ''

  const parse = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return { y: y ?? 0, m: m ?? 1, d: d ?? 1 }
  }
  const a = parse(first.iso)
  const b = parse(last.iso)
  const name = (m: number) => GREGORIAN_SHORT[language][m - 1] ?? ''

  return a.y === b.y
    ? `${name(a.m)} ${a.d} – ${name(b.m)} ${b.d}, ${a.y}`
    : `${name(a.m)} ${a.d}, ${a.y} – ${name(b.m)} ${b.d}, ${b.y}`
}

/**
 * The weekday the month opens on, 0 for Sunday.
 *
 * Only the weekday-aligned grid needs this. An Ethiopian month is a uniform 30 days but
 * the week is still seven, so the first row is as ragged as any Gregorian month's — the
 * uniformity buys a predictable *number* of cells, not a tidy start.
 */
export const ethiopicMonthStartsOn = (year: number, month: number): number => {
  const first = toIso({ year, month, day: 1 })
  const [y, m, d] = first.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).getUTCDay()
}
