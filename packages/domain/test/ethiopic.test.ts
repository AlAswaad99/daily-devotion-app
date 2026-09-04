import { describe, expect, it } from 'vitest'
import {
  daysInEthiopicMonth, ethiopicMonthDays, ethiopicMonthStartsOn, formatEthiopic, gregorianRange,
  monthName, PAGUME, toEthiopic, toIso,
} from '../src/ethiopic.ts'

/**
 * The conversion itself is kenat's job, not ours. These tests pin the anchors the
 * spec calls out, so an upgrade that changed the leap rule could not land quietly.
 */
describe('the Ethiopian new year', () => {
  it('Meskerem 1 falls on 11 September in an ordinary year', () => {
    expect(toEthiopic('2026-09-11')).toEqual({ year: 2019, month: 1, day: 1 })
  })

  it('and on 12 September in the year before a Gregorian leap year', () => {
    // 2028 is a leap year, so EC 2020 begins on 12 September 2027.
    expect(toEthiopic('2027-09-12')).toEqual({ year: 2020, month: 1, day: 1 })
  })

  it('round-trips back to the same Gregorian date', () => {
    for (const iso of ['2026-08-30', '2026-09-11', '2027-01-01', '2027-09-12']) {
      expect(toIso(toEthiopic(iso))).toBe(iso)
    }
  })
})

describe('months', () => {
  it('gives the first twelve months 30 days each', () => {
    for (let month = 1; month < PAGUME; month++) {
      expect(daysInEthiopicMonth(2018, month)).toBe(30)
    }
  })

  it('gives Pagume 5 days, or 6 before a Gregorian leap year', () => {
    // EC 2019 ends on 10 September 2027 because EC 2020 starts on the 12th,
    // making that Pagume six days long.
    expect(daysInEthiopicMonth(2019, PAGUME)).toBe(6)
    expect(daysInEthiopicMonth(2018, PAGUME)).toBe(5)
  })

  it('lays out a month as its own days, with no week padding', () => {
    expect(ethiopicMonthDays(2018, 1)).toHaveLength(30)
    // Pagume stays the short partial row it actually is.
    expect(ethiopicMonthDays(2018, PAGUME)).toHaveLength(5)
    expect(ethiopicMonthDays(2018, 1)[0]).toMatchObject({ ethiopicDay: 1 })
  })

  it('names months in both languages, with Arabic numerals', () => {
    expect(monthName(1, 'en')).toBe('Meskerem')
    expect(monthName(1, 'am')).toBe('መስከረም')
    expect(monthName(PAGUME, 'am')).toBe('ጳጉሜ')
    expect(formatEthiopic('2026-09-11', 'en')).toBe('Meskerem 1, 2019')
  })
})

describe('the Gregorian span under an Ethiopian month', () => {
  it('names both ends and prints the year once when the span stays inside it', () => {
    // Meskerem 2019 runs 11 September to 10 October 2026.
    expect(gregorianRange(2019, 1, 'en')).toBe('Sep 11 – Oct 10, 2026')
  })

  it('prints both years when the month crosses New Year', () => {
    // Tahsas 2019 runs 10 December 2026 to 8 January 2027.
    expect(gregorianRange(2019, 4, 'en')).toBe('Dec 10, 2026 – Jan 8, 2027')
  })

  it('transliterates rather than translates in Amharic', () => {
    expect(gregorianRange(2019, 1, 'am')).toBe('ሴፕቴ 11 – ኦክቶ 10, 2026')
  })

  it('covers Pagume, which is short', () => {
    // Pagume 2018 is 6 September to 10 September 2026 — five days.
    expect(gregorianRange(2018, PAGUME, 'en')).toBe('Sep 6 – Sep 10, 2026')
  })
})

describe('the weekday a month opens on', () => {
  it('is Sunday-based, matching the grid heads', () => {
    // 11 September 2026 is a Friday.
    expect(ethiopicMonthStartsOn(2019, 1)).toBe(5)
  })

  it('advances by two across a 30-day month, because 30 mod 7 is 2', () => {
    const first = ethiopicMonthStartsOn(2019, 1)
    const second = ethiopicMonthStartsOn(2019, 2)
    expect(second).toBe((first + 30) % 7)
  })
})
