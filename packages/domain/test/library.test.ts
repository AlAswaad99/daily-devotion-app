import { describe, expect, it } from 'vitest'
import {
  bookProgress, filterDays, foldForSearch, isFlatResultView, matchesQuery,
  type LibraryDay, type LibraryQuery,
} from '../src/library.ts'

const day = (over: Partial<LibraryDay> = {}): LibraryDay => ({
  id: 'd1',
  bookId: 'b1',
  dayNumber: 1,
  kind: 'devotion',
  topicEn: 'Seeking Profit, Ending in Loss',
  topicAm: 'አተርፍ ባይ አጉዳይ',
  purposeEn: 'Instead of trusting God through the famine…',
  purposeAm: 'የረሀቡን ጊዜ እግዚአብሔር እንደሚያሳልፋቸው…',
  scheduledDate: '2026-08-01',
  completed: false,
  reflected: false,
  favourite: false,
  ...over,
})

const query = (over: Partial<LibraryQuery> = {}): LibraryQuery => ({
  filter: 'all',
  search: '',
  language: 'en',
  ...over,
})

describe('Ethiopic search folding', () => {
  // People type these families interchangeably. Without folding, Amharic search
  // looks broken to a native speaker and simply stops being used.
  it('folds the ሀ family', () => {
    expect(foldForSearch('ሃ')).toBe(foldForSearch('ሀ'))
    expect(foldForSearch('ኀ')).toBe(foldForSearch('ሐ'))
  })

  it('folds ሰ/ሠ, ጸ/ፀ and አ/ዐ', () => {
    expect(foldForSearch('ሠላም')).toBe(foldForSearch('ሰላም'))
    expect(foldForSearch('ፀሎት')).toBe(foldForSearch('ጸሎት'))
    expect(foldForSearch('ዓለም')).toBe(foldForSearch('አለም'))
  })

  it('finds a title typed with the other spelling', () => {
    expect(matchesQuery('የጸሎት ጊዜ', 'ፀሎት')).toBe(true)
  })

  it('is case-insensitive for Latin text', () => {
    expect(matchesQuery('Seeking Profit', 'seeking')).toBe(true)
  })

  it('an empty query matches everything', () => {
    expect(matchesQuery('anything', '   ')).toBe(true)
  })
})

describe('filters', () => {
  const days = [
    day({ id: 'a', completed: true }),
    day({ id: 'b', completed: false }),
    day({ id: 'c', completed: true, reflected: true }),
    day({ id: 'd', favourite: true }),
  ]

  it('all returns everything', () => {
    expect(filterDays(days, query()).map((d) => d.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('completed and unread are complements', () => {
    const completed = filterDays(days, query({ filter: 'completed' })).map((d) => d.id)
    const unread = filterDays(days, query({ filter: 'unread' })).map((d) => d.id)
    expect(completed).toEqual(['a', 'c'])
    expect(unread).toEqual(['b', 'd'])
    expect([...completed, ...unread].sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('reflected and favourites select their own', () => {
    expect(filterDays(days, query({ filter: 'reflected' })).map((d) => d.id)).toEqual(['c'])
    expect(filterDays(days, query({ filter: 'favourites' })).map((d) => d.id)).toEqual(['d'])
  })
})

describe('search across both languages', () => {
  const days = [day({ id: 'en-hit' }), day({ id: 'other', topicEn: 'Decision', topicAm: 'ውሳኔ' })]

  it('matches the English title while reading in Amharic', () => {
    expect(filterDays(days, query({ language: 'am', search: 'Decision' })).map((d) => d.id))
      .toEqual(['other'])
  })

  it('matches the Amharic title while reading in English', () => {
    expect(filterDays(days, query({ search: 'ውሳኔ' })).map((d) => d.id)).toEqual(['other'])
  })
})

describe('date range', () => {
  const days = [
    day({ id: 'jul', scheduledDate: '2026-07-15' }),
    day({ id: 'aug', scheduledDate: '2026-08-15' }),
    day({ id: 'sep', scheduledDate: '2026-09-15' }),
  ]

  it('bounds are inclusive', () => {
    expect(
      filterDays(days, query({ from: '2026-07-15', to: '2026-08-15' })).map((d) => d.id),
    ).toEqual(['jul', 'aug'])
  })
})

describe('result presentation', () => {
  it('is the plain book listing only when nothing is applied', () => {
    expect(isFlatResultView(query())).toBe(false)
    expect(isFlatResultView(query({ filter: 'completed' }))).toBe(true)
    expect(isFlatResultView(query({ search: 'ruth' }))).toBe(true)
    expect(isFlatResultView(query({ from: '2026-08-01' }))).toBe(true)
  })
})

describe('book progress', () => {
  it('counts completed against total', () => {
    expect(bookProgress([day({ completed: true }), day(), day({ completed: true }), day()]))
      .toEqual({ total: 4, completed: 2, fraction: 0.5 })
  })

  it('an empty book is not a division by zero', () => {
    expect(bookProgress([])).toEqual({ total: 0, completed: 0, fraction: 0 })
  })
})
