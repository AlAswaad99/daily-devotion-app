import { log } from '../lib/log'
import { refreshStore } from '../db/webStore'

/**
 * Web's "sync" is just a refetch — there is no outbox to flush, since every write
 * already went straight to `sync_outbox` when it happened (see `data/repository.web`).
 * Kept as `syncNow` with the same shape as the native version so `profile.tsx` and
 * `app/streak.tsx` need no platform-specific code.
 */

export interface SyncResult {
  ok: boolean
  flushed: number
  pulled: number
  today: string | null
  reason?: string
}

let inFlight: Promise<SyncResult> | null = null
let lastCompleted = 0

export const MIN_AUTO_SYNC_MS = 30_000

export async function isOnline(): Promise<boolean> {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function syncNow(options: { force?: boolean } = {}): Promise<SyncResult> {
  if (inFlight) return inFlight

  const since = Date.now() - lastCompleted
  if (!options.force && since < MIN_AUTO_SYNC_MS) {
    return Promise.resolve({ ok: true, flushed: 0, pulled: 0, today: null, reason: 'debounced' })
  }

  inFlight = run().finally(() => {
    inFlight = null
    lastCompleted = Date.now()
  })
  return inFlight
}

async function run(): Promise<SyncResult> {
  try {
    const s = await refreshStore()
    return { ok: true, flushed: 0, pulled: s.days.length, today: s.today }
  } catch (error) {
    log.error('sync', 'refresh failed', error)
    return { ok: false, flushed: 0, pulled: 0, today: null, reason: 'pull' }
  }
}
