import { supabase } from '../lib/supabase'
import { applyOutboxItem } from '../db/webStore'
import { log } from '../lib/log'

/**
 * The web twin of `prayer.ts`. No local database to write through, so each call
 * reaches the server directly — `startSession`/`endSession` via the same
 * `sync_outbox` RPC the phone's outbox flushes to (it already handles a session
 * being created and later completed as two calls against the same id), and reads
 * via the matching `pull_prayer_sessions`/`prayer_summary` RPCs.
 */

export interface PrayerSession {
  id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  completed: boolean
  interruptions: number
}

/** Written immediately, like the native version — a page closed mid-prayer still
 *  leaves a session row on the server rather than losing it entirely. */
export async function startSession(): Promise<string> {
  const id = crypto.randomUUID()
  const startedAt = new Date().toISOString()
  await applyOutboxItem('prayer_session', { id, started_at: startedAt })
  log.info('prayer', 'session started', { id })
  return id
}

export async function endSession(
  id: string,
  seconds: number,
  completed: boolean,
  interruptions: number,
): Promise<void> {
  const endedAt = new Date().toISOString()
  await applyOutboxItem('prayer_session', {
    id,
    ended_at: endedAt,
    duration_seconds: Math.max(0, Math.round(seconds)),
    completed,
    interruptions,
  })
  log.info('prayer', 'session ended', { id, seconds: Math.round(seconds), completed, interruptions })
}

export async function listSessions(limit = 30): Promise<PrayerSession[]> {
  const { data, error } = await supabase.rpc('pull_prayer_sessions', { p_since: null })
  if (error) {
    log.info('prayer', 'could not list sessions', { message: error.message })
    return []
  }
  return ((data ?? []) as PrayerSession[]).filter((s) => s.ended_at !== null).slice(0, limit)
}

export interface PrayerSummary {
  sessions: number
  minutes: number
  interruptions: number
  completed: number
}

export async function summary(days = 30): Promise<PrayerSummary> {
  const { data, error } = await supabase.rpc('prayer_summary', { p_days: days })
  const row = (data as PrayerSummary[] | null)?.[0]
  if (error || !row) return { sessions: 0, minutes: 0, interruptions: 0, completed: 0 }
  return {
    sessions: Number(row.sessions),
    minutes: Number(row.minutes),
    interruptions: Number(row.interruptions),
    completed: Number(row.completed),
  }
}
