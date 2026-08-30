import { afterAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { computeStreak, type ScheduledDay } from '../src/streak.ts'
import type { CompletionMethod } from '../src/enums.ts'
import type { IsoDate } from '../src/ids.ts'

/**
 * Phase 2's exit criterion: the server-side recomputation agrees with the client
 * every time.
 *
 * Two implementations of the same rules exist by necessity — the client needs an
 * instant optimistic answer, the server needs an authoritative one that a tampered
 * device cannot influence. Two implementations means they can drift, so this runs
 * both over the same fixtures and compares. If `computeStreak` and
 * `recompute_streak` ever disagree, this goes red.
 *
 * Needs the local stack: `pnpm db:start`. Skipped when it is not running, so the
 * unit-test CI job stays fast; the database job sets ABIDE_DB_URL and runs it.
 */
const DB_URL =
  process.env.ABIDE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * Connect at module load so the suite can be *skipped*, loudly, rather than passing
 * vacuously when the stack is down — a green tick that proved nothing would be
 * worse than no test at all.
 */
const connect = async (): Promise<Client | null> => {
  const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 })
  try {
    await client.connect()
    await client.query('select 1 from streak_state limit 0')
    return client
  } catch {
    await client.end().catch(() => {})
    return null
  }
}

const db = await connect()

const CHURCH = '99999999-9999-4999-8999-999999999999'
const MINISTRY = '88888888-8888-4888-8888-888888888888'
const USER = '77777777-7777-4777-8777-777777777777'
const BOOK = '66666666-6666-4666-8666-666666666666'

afterAll(async () => {
  await db?.end()
})

interface Scenario {
  name: string
  /** Offsets from today, negative is the past. A missing offset is an unscheduled date. */
  offsets: number[]
  /** Which of those days are complete, and how. */
  completed: Record<number, CompletionMethod>
  /** Offset at which the user joined. */
  joinedOffset: number
}

const scenarios: Scenario[] = [
  {
    name: 'a clean five-day run ending today',
    offsets: [-4, -3, -2, -1, 0],
    completed: { [-4]: 'live', [-3]: 'live', [-2]: 'live', [-1]: 'live', 0: 'live' },
    joinedOffset: -10,
  },
  {
    name: 'today still open',
    offsets: [-4, -3, -2, -1, 0],
    completed: { [-4]: 'live', [-3]: 'live', [-2]: 'live', [-1]: 'live' },
    joinedOffset: -10,
  },
  {
    name: 'a break in the middle',
    offsets: [-4, -3, -2, -1, 0],
    completed: { [-4]: 'live', [-3]: 'live', [-1]: 'live', 0: 'live' },
    joinedOffset: -10,
  },
  {
    name: 'backfilled, so still broken',
    offsets: [-4, -3, -2, -1, 0],
    completed: { [-4]: 'live', [-3]: 'backfill', [-2]: 'backfill', [-1]: 'live', 0: 'live' },
    joinedOffset: -10,
  },
  {
    name: 'repaired, so restored',
    offsets: [-4, -3, -2, -1, 0],
    completed: { [-4]: 'live', [-3]: 'repair', [-2]: 'live', [-1]: 'live', 0: 'live' },
    joinedOffset: -10,
  },
  {
    name: 'a gap between books is skipped, not broken',
    offsets: [-9, -8, -1, 0],
    completed: { [-9]: 'live', [-8]: 'live', [-1]: 'live', 0: 'live' },
    joinedOffset: -20,
  },
  {
    name: 'a late joiner starts from their join date',
    offsets: [-6, -5, -4, -3, -2, -1, 0],
    completed: { [-2]: 'live', [-1]: 'live', 0: 'live' },
    joinedOffset: -2,
  },
  {
    name: 'nothing completed at all',
    offsets: [-3, -2, -1, 0],
    completed: {},
    joinedOffset: -10,
  },
  {
    name: 'only today, after a long lapse',
    offsets: [-5, -4, -3, -2, -1, 0],
    completed: { 0: 'live' },
    joinedOffset: -10,
  },
  {
    name: 'best is preserved after the current run collapses',
    offsets: [-8, -7, -6, -5, -4, -3, -2, -1, 0],
    completed: {
      [-8]: 'live', [-7]: 'live', [-6]: 'live', [-5]: 'live',
      [-1]: 'live', 0: 'live',
    },
    joinedOffset: -20,
  },
]

const isoAt = (offset: number, today: Date): IsoDate => {
  const d = new Date(today)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10) as IsoDate
}

describe.skipIf(db === null)('client and server streak engines agree', () => {
  it.each(scenarios)('$name', async (scenario) => {
    if (!db) throw new Error('unreachable: suite is skipped without a database')

    await db.query('begin')
    try {
      await db.query(`set local role postgres`)
      await db.query(
        `insert into churches (id, name_en, name_am) values ($1, 'Parity', 'Parity')`,
        [CHURCH],
      )
      await db.query(
        `insert into ministries (id, church_id, name_en, name_am) values ($1, $2, 'P', 'P')`,
        [MINISTRY, CHURCH],
      )
      await db.query(
        `insert into auth.users (id, email, instance_id, aud, role)
         values ($1, 'parity@example.com', '00000000-0000-0000-0000-000000000000',
                 'authenticated', 'authenticated')`,
        [USER],
      )

      const today = new Date(
        (await db.query<{ t: string }>(`select ministry_today()::text as t`)).rows[0]!.t +
          'T00:00:00Z',
      )
      const joinedOn = isoAt(scenario.joinedOffset, today)

      await db.query(
        `insert into profiles (id, church_id, ministry_id, display_name, joined_on)
         values ($1, $2, $3, 'Parity', $4)`,
        [USER, CHURCH, MINISTRY, joinedOn],
      )
      await db.query(`insert into streak_state (user_id) values ($1)`, [USER])

      const roundId = (
        await db.query<{ id: string }>(
          `insert into rounds (church_id, ministry_id, phase_code, round_code, starts_on, status)
           values ($1, $2, '99', '99', $3, 'published') returning id`,
          [CHURCH, MINISTRY, joinedOn],
        )
      ).rows[0]!.id

      await db.query(
        `insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
         values ($1, $2, $3, 1, 'PARITY', 'Parity', 'Parity', 'published')`,
        [BOOK, CHURCH, roundId],
      )

      const scheduled: ScheduledDay[] = []
      for (const [i, offset] of scenario.offsets.entries()) {
        const date = isoAt(offset, today)
        const id = (
          await db.query<{ id: string }>(
            `insert into devotion_days
               (church_id, book_id, day_number, topic_en, topic_am, status, scheduled_date)
             values ($1, $2, $3, 'x', 'x', 'published', $4) returning id`,
            [CHURCH, BOOK, i + 1, date],
          )
        ).rows[0]!.id
        scheduled.push({ id, date: date as IsoDate })
      }

      const completions: Array<{ devotionDayId: string; method: CompletionMethod }> = []
      for (const [i, offset] of scenario.offsets.entries()) {
        const method = scenario.completed[offset]
        if (!method) continue
        const day = scheduled[i]!
        completions.push({ devotionDayId: day.id, method })
        await db.query(
          `insert into day_completions
             (user_id, devotion_day_id, counted_for_streak, method)
           values ($1, $2, $3, $4)`,
          [USER, day.id, method !== 'backfill', method],
        )
      }

      // The server's answer, computed as the user themselves.
      await db.query(`set local role authenticated`)
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: USER, role: 'authenticated' }),
      ])
      const server = (
        await db.query<{
          current: number
          best: number
          last_counted_date: string | null
          missed_dates: string[]
        }>(
          `select current, best, last_counted_date::text as last_counted_date,
                  missed_dates::text[] as missed_dates
           from recompute_streak($1)`,
          [USER],
        )
      ).rows[0]!

      const client = computeStreak({
        scheduled,
        completions,
        joinedOn: joinedOn as IsoDate,
        today: today.toISOString().slice(0, 10) as IsoDate,
      })

      expect({
        current: Number(server.current),
        best: Number(server.best),
        lastCountedDate: server.last_counted_date,
        missedDates: server.missed_dates ?? [],
      }).toEqual({
        current: client.current,
        best: client.best,
        lastCountedDate: client.lastCountedDate,
        missedDates: client.missedDates,
      })
    } finally {
      await db.query('rollback')
    }
  })
})
