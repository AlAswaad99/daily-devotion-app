import { describe, expect, it } from 'vitest'
import { prepareBundle, scheduleDays, type SourceBundle } from '../src/import.ts'
import ruth from '../../../book_01_ruth_localized.json' with { type: 'json' }
import psalms from '../../../book_02_psalms_localized.json' with { type: 'json' }
import timothy from '../../../book_03_1st_timothy_localized.json' with { type: 'json' }

const bundles = [ruth, psalms, timothy] as unknown as SourceBundle[]

const prepareAll = () => {
  const books = []
  const issues = []
  let sequence = 0
  for (const b of bundles) {
    const p = prepareBundle(b, sequence)
    sequence += p.books.length
    books.push(...p.books)
    issues.push(...p.issues)
  }
  return { books, issues }
}

describe('summary days', () => {
  it('adds one real day per book, so 53 devotions become 56 scheduled days', () => {
    const { books } = prepareAll()
    const devotions = books.reduce(
      (n, b) => n + b.days.filter((d) => d.kind === 'devotion').length, 0,
    )
    const summaries = books.reduce(
      (n, b) => n + b.days.filter((d) => d.kind === 'summary').length, 0,
    )
    expect(devotions).toBe(53)
    expect(summaries).toBe(3)
    expect(devotions + summaries).toBe(56)
  })

  it('numbers the summary day after the last devotion of its book', () => {
    const { books } = prepareAll()
    const ruthBook = books.find((b) => b.sourceId === 'BOOK 01')!
    expect(ruthBook.days.at(-1)).toMatchObject({ kind: 'summary', dayNumber: 11 })
    expect(ruthBook.summaryQuestions).toHaveLength(3)
  })
})

describe('passages', () => {
  it('recovers a passage for every Psalms day, which has no verses field', () => {
    const { books } = prepareAll()
    const psalmsBook = books.find((b) => b.sourceId === 'BOOK 02')!
    const devotions = psalmsBook.days.filter((d) => d.kind === 'devotion')
    expect(devotions.every((d) => d.passage !== null)).toBe(true)
    expect(devotions[0]!.passage).toMatchObject({ book: 19, chapter: 42 })
  })

  it('gives every devotion day a passage', () => {
    const { books } = prepareAll()
    const missing = books.flatMap((b) =>
      b.days.filter((d) => d.kind === 'devotion' && !d.passage),
    )
    expect(missing).toEqual([])
  })

  it('gives every day a reading estimate at or above the 90 second floor', () => {
    const { books } = prepareAll()
    expect(books.every((b) => b.days.every((d) => d.expectedSeconds >= 90))).toBe(true)
  })
})

describe('issues', () => {
  // The six in CONTENT_ISSUES.md. If this number moves, either the ministry fixed
  // something or the parser regressed — both are worth a failing test.
  it('reports exactly the six references awaiting a ministry decision', () => {
    const { issues } = prepareAll()
    expect(issues).toHaveLength(6)
    expect(issues.map((i) => `${i.book}#${i.day}`)).toEqual([
      'BOOK 01#2', 'BOOK 02#18', 'BOOK 02#27', 'BOOK 02#30', 'BOOK 03#1', 'BOOK 03#8',
    ])
  })
})

describe('scheduling', () => {
  it('runs every calendar day, books back to back, summary days included', () => {
    const { books } = prepareAll()
    const schedule = scheduleDays(books, '2026-01-01')
    expect(schedule.size).toBe(56)
    // Ruth is 10 devotions + 1 summary, so Psalms day 1 lands on the 12th.
    expect(schedule.get('BOOK 01#1')).toBe('2026-01-01')
    expect(schedule.get('BOOK 01#11')).toBe('2026-01-11')
    expect(schedule.get('BOOK 02#1')).toBe('2026-01-12')

    const dates = [...schedule.values()].sort()
    expect(new Set(dates).size).toBe(56)
    // No gaps: the last day is exactly 55 days after the first.
    const span =
      (Date.parse(dates.at(-1)!) - Date.parse(dates[0]!)) / (24 * 60 * 60 * 1000)
    expect(span).toBe(55)
  })
})
