import { describe, expect, it } from 'vitest'
import {
  daysInEthiopicMonth, ethiopicMonthDays, formatEthiopic, monthName, PAGUME, toEthiopic, toIso,
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
