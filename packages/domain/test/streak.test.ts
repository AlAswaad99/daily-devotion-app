import { describe, expect, it } from 'vitest'
import { computeStreak, type ScheduledDay, type StreakInput } from '../src/streak.ts'
import { doubleUp, eligibleRepairs, monthlyCredit } from '../src/repair-rules.ts'
import type { IsoDate, UserId } from '../src/ids.ts'
import type { Profile, StreakState } from '../src/entities.ts'

const d = (s: string) => s as IsoDate

/** Scheduled days on consecutive dates from `from`, ids `d1`, `d2`, ... */
const consecutive = (from: string, count: number): ScheduledDay[] =>
  Array.from({ length: count }, (_, i) => {
    const date = new Date(`${from}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + i)
    return { id: `d${i + 1}`, date: d(date.toISOString().slice(0, 10)) }
  })

const run = (partial: Partial<StreakInput> & Pick<StreakInput, 'scheduled' | 'today'>) =>
  computeStreak({
    completions: [],
    joinedOn: d('2026-01-01'),
    ...partial,
  })

const live = (...ids: string[]) => ids.map((id) => ({ devotionDayId: id, method: 'live' as const }))

describe('the basic run', () => {
  const scheduled = consecutive('2026-03-01', 5)

  it('counts consecutive completed days', () => {
    const s = run({ scheduled, today: d('2026-03-05'), completions: live('d1', 'd2', 'd3', 'd4', 'd5') })
    expect(s).toMatchObject({ current: 5, best: 5, lastCountedDate: '2026-03-05' })
  })

  it('does not break on an uncompleted today — the day has not ended', () => {
    const s = run({ scheduled, today: d('2026-03-05'), completions: live('d1', 'd2', 'd3', 'd4') })
    expect(s.current).toBe(4)
    expect(s.todayComplete).toBe(false)
    expect(s.missedDates).toEqual([])
  })

  it('breaks once a missed day is in the past', () => {
    const s = run({ scheduled, today: d('2026-03-05'), completions: live('d1', 'd2', 'd4', 'd5') })
    expect(s.current).toBe(2)
    expect(s.missedDates).toEqual(['2026-03-03'])
  })

  it('keeps the best streak after a break', () => {
    const s = run({ scheduled, today: d('2026-03-05'), completions: live('d1', 'd2', 'd3', 'd5') })
    expect(s).toMatchObject({ current: 1, best: 3 })
  })
})

describe('backfill versus repair', () => {
  const scheduled = consecutive('2026-03-01', 4)

  it('backfilling marks the day read but leaves the streak broken', () => {
    const s = computeStreak({
      scheduled,
      today: d('2026-03-04'),
      joinedOn: d('2026-01-01'),
      completions: [
        ...live('d1', 'd4'),
        { devotionDayId: 'd2', method: 'backfill' },
        { devotionDayId: 'd3', method: 'backfill' },
      ],
    })
    expect(s.current).toBe(1)
    expect(s.missedDates).toEqual(['2026-03-02', '2026-03-03'])
  })

  it('repairing restores the link', () => {
    const s = computeStreak({
      scheduled,
      today: d('2026-03-04'),
      joinedOn: d('2026-01-01'),
      completions: [...live('d1', 'd3', 'd4'), { devotionDayId: 'd2', method: 'repair' }],
    })
    expect(s.current).toBe(4)
    expect(s.missedDates).toEqual([])
  })
})

describe('the calendar does not matter, the schedule does', () => {
  it('skips a gap between books rather than breaking on it', () => {
    // Two books with a four-day gap between them: no scheduled days, so no break.
    const scheduled: ScheduledDay[] = [
      { id: 'a1', date: d('2026-03-01') },
      { id: 'a2', date: d('2026-03-02') },
      { id: 'b1', date: d('2026-03-07') },
      { id: 'b2', date: d('2026-03-08') },
    ]
    const s = run({ scheduled, today: d('2026-03-08'), completions: live('a1', 'a2', 'b1', 'b2') })
    expect(s.current).toBe(4)
  })

  it('excludes pre-join days entirely', () => {
    const scheduled = consecutive('2026-03-01', 5)
    const s = computeStreak({
      scheduled,
      today: d('2026-03-05'),
      joinedOn: d('2026-03-04'),
      completions: live('d4', 'd5'),
    })
    // d1..d3 are pre-join: not counted, and crucially not missed either.
    expect(s).toMatchObject({ current: 2, best: 2 })
    expect(s.missedDates).toEqual([])
  })

  it('ignores future days', () => {
    const scheduled = consecutive('2026-03-01', 10)
    const s = run({ scheduled, today: d('2026-03-03'), completions: live('d1', 'd2', 'd3') })
    expect(s.current).toBe(3)
  })
})

const profile = { id: 'u1' as UserId } as Profile
const state = (repairCredits: number): StreakState =>
  ({ userId: 'u1' as UserId, current: 0, best: 0, lastCountedDate: null, repairCredits })

const ctx = (over: Partial<Parameters<typeof doubleUp.eligible>[0]> = {}) => ({
  user: profile,
  missedDate: d('2026-03-03'),
  today: d('2026-03-04'),
  now: '2026-03-04T06:00:00Z' as never,
  state: state(1),
  todayComplete: true,
  ...over,
})

describe('repair rules', () => {
  it('double_up needs today finished first', () => {
    expect(doubleUp.eligible(ctx({ todayComplete: false }))).toBe(false)
    expect(doubleUp.eligible(ctx())).toBe(true)
  })

  it('double_up expires after 48 hours', () => {
    expect(doubleUp.eligible(ctx({ today: d('2026-03-05') }))).toBe(true)
    expect(doubleUp.eligible(ctx({ today: d('2026-03-06') }))).toBe(false)
  })

  it('monthly_credit needs an unspent credit', () => {
    expect(monthlyCredit.eligible(ctx({ state: state(0) }))).toBe(false)
    expect(monthlyCredit.eligible(ctx({ state: state(1) }))).toBe(true)
  })

  it('monthly_credit reaches back a week, double_up does not', () => {
    const week = ctx({ today: d('2026-03-09') })
    expect(monthlyCredit.eligible(week)).toBe(true)
    expect(doubleUp.eligible(week)).toBe(false)
    expect(eligibleRepairs(week).map((r) => r.key)).toEqual(['monthly_credit'])
  })

  it('states its cost before the user commits', () => {
    expect(doubleUp.cost(ctx())).toMatchObject({ kind: 'action' })
    expect(monthlyCredit.cost(ctx())).toMatchObject({ kind: 'credit', amount: 1 })
  })

  it('returns events rather than writing anything', () => {
    const events = doubleUp.apply(ctx())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ kind: 'repaired', scheduledDate: '2026-03-03' })
  })
})
