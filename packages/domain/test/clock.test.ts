import { describe, expect, it } from 'vitest'
import {
  ethiopicHour, formatDuration, formatEthiopicClock, formatWindow, fromSqlTime,
  normaliseMinute, partOfDayForMinute, toSqlTime,
} from '../src/clock.ts'

/**
 * The clock is display-only — everything stored stays on the 24-hour clock — so what
 * these pin is the conversion and the boundaries, which is where it can go wrong
 * quietly.
 */
describe('the Ethiopian hour', () => {
  it('starts the day at dawn: six in the morning is twelve', () => {
    expect(ethiopicHour(6)).toBe(12)
  })

  it('counts on from there', () => {
    expect(ethiopicHour(7)).toBe(1)
    expect(ethiopicHour(13)).toBe(7)
  })

  it('returns twelve rather than zero at each turn of the cycle', () => {
    expect(ethiopicHour(18)).toBe(12)
    expect(ethiopicHour(0)).toBe(6)
  })

  it('formats with the real minutes and Arabic numerals', () => {
    expect(formatEthiopicClock(6 * 60)).toBe('12:00')
    expect(formatEthiopicClock(13 * 60 + 30)).toBe('7:30')
  })
})

describe('part of day', () => {
  /*
   * These boundaries are the database's, not ours — `part_of_day_for(time)` owns the
   * rule and a trigger derives the column. If one of these fails after a migration,
   * this copy is the one that is wrong.
   */
  it.each([
    [6 * 60, 'morning'],
    [11 * 60 + 59, 'morning'],
    [12 * 60, 'afternoon'],
    [17 * 60 + 59, 'afternoon'],
    [18 * 60, 'evening'],
    [20 * 60 + 59, 'evening'],
    [21 * 60, 'night'],
    [3 * 60, 'night'],
    [5 * 60 + 59, 'night'],
  ])('%i minutes is %s', (minute, part) => {
    expect(partOfDayForMinute(minute)).toBe(part)
  })
})

describe('minutes wrap rather than clamp', () => {
  it('nudging back from midnight lands at the end of the day', () => {
    expect(normaliseMinute(-15)).toBe(1425)
    expect(formatEthiopicClock(-15)).toBe('5:45')
  })

  it('and forward past midnight comes round again', () => {
    expect(normaliseMinute(1440)).toBe(0)
    expect(normaliseMinute(1455)).toBe(15)
  })
})

describe('the window as one line', () => {
  it('names the period once when it does not leave it', () => {
    expect(formatWindow(6 * 60, 30, 'am')).toBe('12:00 – 12:30 ጠዋት')
    expect(formatWindow(6 * 60, 30, 'en')).toBe('12:00 – 12:30 morning')
  })

  it('names both when the window spills into the next one', () => {
    // 11:30 for an hour ends at 12:30, which is afternoon.
    expect(formatWindow(11 * 60 + 30, 60, 'am')).toBe('5:30 ጠዋት – 6:30 ከሰዓት')
  })

  it('crosses midnight without repeating the period it never left', () => {
    // 23:45 for half an hour ends at 00:15. Both are night, so it is named once.
    expect(formatWindow(23 * 60 + 45, 30, 'en')).toBe('5:45 – 6:15 night')
  })

  it('names both when a window crosses midnight and changes period', () => {
    // 05:45 for half an hour ends at 06:15, which is morning.
    expect(formatWindow(5 * 60 + 45, 30, 'am')).toBe('11:45 ሌሊት – 12:15 ጠዋት')
  })
})

describe('duration reads as a phrase', () => {
  it.each([
    [15, 'en', '15 min'],
    [45, 'en', '45 min'],
    [60, 'en', '1 hour'],
    [90, 'en', '1½ hours'],
    [120, 'en', '2 hours'],
    [30, 'am', '30 ደቂቃ'],
    [90, 'am', '1½ ሰዓት'],
  ])('%i minutes in %s is "%s"', (minutes, language, expected) => {
    expect(formatDuration(minutes, language as 'en' | 'am')).toBe(expected)
  })
})

describe('the SQL boundary stays on the 24-hour clock', () => {
  it('writes the time the column expects', () => {
    expect(toSqlTime(6 * 60)).toBe('06:00:00')
    expect(toSqlTime(13 * 60 + 45)).toBe('13:45:00')
  })

  it('round-trips', () => {
    expect(fromSqlTime(toSqlTime(19 * 60 + 30))).toBe(19 * 60 + 30)
  })
})
