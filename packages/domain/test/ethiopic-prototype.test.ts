import { describe, expect, it } from 'vitest'
import { daysInEthiopicMonth, toEthiopic, toIso } from '../src/ethiopic.ts'

/**
 * kenat against the design prototype's own arithmetic.
 *
 * The v3 handoff asks for the prototype's four JDN functions to be ported verbatim.
 * The app instead uses kenat, which an earlier decision made the single source for the
 * Ethiopian calendar so that the design and `ethiopic.ts` could not drift. This test is
 * what makes that substitution honest: the prototype's functions are reproduced here,
 * unmodified, and checked against kenat across every day of a twenty-year span.
 *
 * If they ever disagree, this fails and the decision gets revisited — rather than a
 * member seeing one date on the streak grid and another in the design review.
 */

/* Verbatim from `class Component extends DCLogic` in `project/Abide v3.dc.html`. */
const toJdn = (y: number, m: number, d: number) => {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  )
}

const ethFromJdn = (j: number) => {
  const r = (j - 1723856) % 1461
  const n = (r % 365) + 365 * Math.floor(r / 1460)
  return {
    y: 4 * Math.floor((j - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    m: Math.floor(n / 30) + 1,
    d: (n % 30) + 1,
  }
}

const ethToJdn = (y: number, m: number, d: number) =>
  1723856 + 365 + 365 * (y - 1) + Math.floor(y / 4) + 30 * m + d - 31

const iso = (date: Date) => date.toISOString().slice(0, 10)

describe('kenat matches the design prototype', () => {
  it('agrees on every Gregorian day from 2010 to 2030', () => {
    const cursor = new Date(Date.UTC(2010, 0, 1))
    const end = Date.UTC(2030, 11, 31)
    const disagreements: string[] = []

    while (cursor.getTime() <= end) {
      const [y, m, d] = iso(cursor).split('-').map(Number)
      const prototype = ethFromJdn(toJdn(y!, m!, d!))
      const kenat = toEthiopic(iso(cursor))

      if (
        kenat.year !== prototype.y ||
        kenat.month !== prototype.m ||
        kenat.day !== prototype.d
      ) {
        disagreements.push(
          `${iso(cursor)}: kenat ${kenat.year}-${kenat.month}-${kenat.day}, ` +
            `prototype ${prototype.y}-${prototype.m}-${prototype.d}`,
        )
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    expect(disagreements.slice(0, 5)).toEqual([])
  })

  it('agrees on the Gregorian date each Ethiopian month opens on', () => {
    for (let year = 2002; year <= 2023; year++) {
      for (let month = 1; month <= 13; month++) {
        const jdn = ethToJdn(year, month, 1)
        /* JDN 0 is 1 January 4713 BC noon; the epoch below is its UTC midnight. */
        const fromPrototype = new Date((jdn - 2440588) * 86_400_000)
        expect(toIso({ year, month, day: 1 })).toBe(iso(fromPrototype))
      }
    }
  })

  it('gives Pagume 6 days when the Ethiopian year mod 4 is 3', () => {
    for (let year = 2002; year <= 2023; year++) {
      expect(daysInEthiopicMonth(year, 13)).toBe(year % 4 === 3 ? 6 : 5)
    }
  })
})
