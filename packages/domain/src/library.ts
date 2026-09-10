import type { Language } from './enums.ts'
import type { ScriptureRef } from './scripture.ts'

/**
 * Library filtering and search.
 *
 * Pure, and shared, because the same rules decide what the library shows, what the
 * Reflect tab shows, and — in Phase 5 — what the admin previews. A day being
 * invisible is a promise the spec makes twice; it should not be re-implemented per
 * screen.
 */

export const LIBRARY_FILTERS = ['all', 'completed', 'unread', 'reflected', 'favourites'] as const
export type LibraryFilter = (typeof LIBRARY_FILTERS)[number]

export interface LibraryDay {
  id: string
  bookId: string
  dayNumber: number
  kind: 'devotion' | 'summary'
  topicEn: string
  topicAm: string
  purposeEn: string
  purposeAm: string
  scheduledDate: string
  /** The passage the day is about, for the sub-line on a row. Not every day has one. */
  passage: ScriptureRef | null
  completed: boolean
  reflected: boolean
  favourite: boolean
  /** Scheduled after today — visible so the library shows the round's shape, but
   *  purposeEn/purposeAm are empty strings and there's nothing to read yet. */
  locked: boolean
}

/**
 * Ethiopic has interchangeable character families that people type inconsistently.
 * Folding them is what stops Amharic search appearing simply broken to a native
 * speaker — the kind of bug nobody reports, they just stop using the feature.
 *
 * The same folding must be applied to the text and to the query.
 */
const ETHIOPIC_FOLDING: Array<[RegExp, string]> = [
  [/[ሀሃኀኃሐሓኻ]/g, 'ሀ'],
  [/[ሁኁሑ]/g, 'ሁ'],
  [/[ሂኂሒ]/g, 'ሂ'],
  [/[ሄኄሔ]/g, 'ሄ'],
  [/[ህኅሕ]/g, 'ህ'],
  [/[ሆኆሖ]/g, 'ሆ'],
  [/[ሰሠ]/g, 'ሰ'],
  [/[ሱሡ]/g, 'ሱ'],
  [/[ሲሢ]/g, 'ሲ'],
  [/[ሳሣ]/g, 'ሳ'],
  [/[ሴሤ]/g, 'ሴ'],
  [/[ስሥ]/g, 'ስ'],
  [/[ሶሦ]/g, 'ሶ'],
  [/[ጸፀ]/g, 'ጸ'],
  [/[ጹፁ]/g, 'ጹ'],
  [/[ጺፂ]/g, 'ጺ'],
  [/[ጻፃ]/g, 'ጻ'],
  [/[ጼፄ]/g, 'ጼ'],
  [/[ጽፅ]/g, 'ጽ'],
  [/[ጾፆ]/g, 'ጾ'],
  [/[አዐኣዓ]/g, 'አ'],
  [/[ኡዑ]/g, 'ኡ'],
  [/[ኢዒ]/g, 'ኢ'],
  [/[ኤዔ]/g, 'ኤ'],
  [/[እዕ]/g, 'እ'],
  [/[ኦዖ]/g, 'ኦ'],
]

/** Canonical form for both the search index and the query. */
export function foldForSearch(text: string): string {
  let folded = text.normalize('NFC').toLowerCase()
  for (const [pattern, replacement] of ETHIOPIC_FOLDING) {
    folded = folded.replace(pattern, replacement)
  }
  return folded
}

export const matchesQuery = (haystack: string, query: string): boolean => {
  const needle = foldForSearch(query).trim()
  if (!needle) return true
  return foldForSearch(haystack).includes(needle)
}

export function matchesFilter(day: LibraryDay, filter: LibraryFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'completed':
      return day.completed
    case 'unread':
      return !day.completed
    case 'reflected':
      return day.reflected
    case 'favourites':
      return day.favourite
  }
}

export interface LibraryQuery {
  filter: LibraryFilter
  search: string
  language: Language
  /** Inclusive ISO date bounds. */
  from?: string
  to?: string
}

export function filterDays(days: readonly LibraryDay[], query: LibraryQuery): LibraryDay[] {
  return days.filter((day) => {
    if (!matchesFilter(day, query.filter)) return false
    if (query.from && day.scheduledDate < query.from) return false
    if (query.to && day.scheduledDate > query.to) return false
    if (!query.search.trim()) return true

    // Search both languages regardless of the UI setting: someone reading in
    // English may well remember an Amharic title, and vice versa.
    const haystack = [day.topicEn, day.topicAm, day.purposeEn, day.purposeAm].join(' ')
    return matchesQuery(haystack, query.search)
  })
}

/** A flat result list is shown whenever the view is not the plain book listing. */
export const isFlatResultView = (query: LibraryQuery): boolean =>
  query.filter !== 'all' || query.search.trim().length > 0 || Boolean(query.from || query.to)

export interface BookProgress {
  total: number
  completed: number
  /** 0..1, for the progress bar. */
  fraction: number
}

export function bookProgress(days: readonly LibraryDay[]): BookProgress {
  const total = days.length
  const completed = days.filter((d) => d.completed).length
  return { total, completed, fraction: total === 0 ? 0 : completed / total }
}
