import * as Crypto from 'expo-crypto'
import { getDatabase } from '../db/database'
import { enqueue } from '../sync/outbox'
import { log } from '../lib/log'

/**
 * Prayer sessions.
 *
 * Written locally the moment prayer starts, not when it ends. A session that is
 * interrupted by a dead battery is still a session that happened, and recording only
 * on completion would lose exactly the sessions worth being honest about.
 *
 * Nothing here touches the streak. Prayer is tracked and shown; it is not a condition
 * of anything, per the spec. Scoring prayer would change what it is for.
 */

export interface PrayerSession {
  id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  completed: boolean
  interruptions: number
}

interface Row extends Omit<PrayerSession, 'completed'> {
  completed: number
}

const toSession = (r: Row): PrayerSession => ({ ...r, completed: r.completed === 1 })

/** Begin a session and return its id. Queued immediately, so a crash cannot erase it. */
export async function startSession(): Promise<string> {
  const id = Crypto.randomUUID()
  const startedAt = new Date().toISOString()
  const db = await getDatabase()

  await db.runAsync(
    `insert into prayer_sessions (id, started_at, duration_seconds, completed, interruptions, pending)
     values (?, ?, 0, 0, 0, 1)`,
    [id, startedAt],
  )

  log.info('prayer', 'session started', { id })
  return id
}

/**
 * Record how a session ended.
 *
 * Queued for the server here rather than at the start: one outbox item carrying the
 * finished shape, with the same client-generated id, so a replay corrects rather than
 * duplicates.
 */
export async function endSession(
  id: string,
  seconds: number,
  completed: boolean,
  interruptions: number,
): Promise<void> {
  const endedAt = new Date().toISOString()
  const db = await getDatabase()

  const row = await db.getFirstAsync<{ started_at: string }>(
    'select started_at from prayer_sessions where id = ?',
    [id],
  )
  if (!row) return

  await db.runAsync(
    `update prayer_sessions
        set ended_at = ?, duration_seconds = ?, completed = ?, interruptions = ?, pending = 1
      where id = ?`,
    [endedAt, Math.max(0, Math.round(seconds)), completed ? 1 : 0, interruptions, id],
  )

  await enqueue('prayer_session', {
    id,
    started_at: row.started_at,
    ended_at: endedAt,
    duration_seconds: Math.max(0, Math.round(seconds)),
    completed,
    interruptions,
  })

  log.info('prayer', 'session ended', { id, seconds: Math.round(seconds), completed, interruptions })
}

export async function listSessions(limit = 30): Promise<PrayerSession[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<Row>(
    `select id, started_at, ended_at, duration_seconds, completed, interruptions
       from prayer_sessions
      where ended_at is not null
      order by started_at desc
      limit ?`,
    [limit],
  )
  return rows.map(toSession)
}

export interface PrayerSummary {
  sessions: number
  minutes: number
  interruptions: number
  completed: number
}

/**
 * Computed locally, from local rows.
 *
 * The server has the same numbers, but asking it would make the screen depend on a
 * network for something the phone already knows — and this screen has to work in
 * airplane mode like every other one.
 */
export async function summary(days = 30): Promise<PrayerSummary> {
  const db = await getDatabase()
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const row = await db.getFirstAsync<PrayerSummary>(
    `select count(*) as sessions,
            coalesce(sum(duration_seconds), 0) / 60 as minutes,
            coalesce(sum(interruptions), 0) as interruptions,
            coalesce(sum(completed), 0) as completed
       from prayer_sessions
      where ended_at is not null and started_at >= ?`,
    [since],
  )
  return row ?? { sessions: 0, minutes: 0, interruptions: 0, completed: 0 }
}

/**
 * Sessions the server sent back, for a phone that has been reinstalled.
 *
 * Local rows still waiting to flush are left alone: they are newer than anything the
 * server can know about, and overwriting them would lose a prayer.
 */
export async function storePulled(rows: PrayerSession[]): Promise<void> {
  if (rows.length === 0) return
  const db = await getDatabase()
  for (const r of rows) {
    await db.runAsync(
      `insert into prayer_sessions
         (id, started_at, ended_at, duration_seconds, completed, interruptions, pending)
       values (?, ?, ?, ?, ?, ?, 0)
       on conflict (id) do update set
         ended_at = excluded.ended_at,
         duration_seconds = excluded.duration_seconds,
         completed = excluded.completed,
         interruptions = excluded.interruptions
       where prayer_sessions.pending = 0`,
      [
        r.id,
        r.started_at,
        r.ended_at,
        r.duration_seconds,
        r.completed ? 1 : 0,
        r.interruptions,
      ],
    )
  }
}

/** Clear the pending flag once the outbox has confirmed the flush. */
export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const db = await getDatabase()
  await db.runAsync(
    `update prayer_sessions set pending = 0 where id in (${ids.map(() => '?').join(',')})`,
    ids,
  )
}
