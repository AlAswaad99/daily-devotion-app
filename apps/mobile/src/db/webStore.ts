import { supabase } from '../lib/supabase'
import { log } from '../lib/log'

/**
 * The web equivalent of the local SQLite database: an in-memory cache of exactly
 * what `pull_content` returns, refetched on demand rather than persisted and synced.
 *
 * Web has no offline requirement, so there is no outbox and no local durability —
 * a write goes straight through `sync_outbox` (the same RPC the phone's outbox
 * flushes to) and the cache is updated from its result. This is deliberately the
 * same server contract the native app uses, just without the SQLite round-trip.
 */

export type Row = Record<string, unknown>

export interface WebStoreState {
  serverTime: string
  today: string | null
  rounds: Row[]
  books: Row[]
  days: Row[]
  summaryQuestions: Row[]
  completions: Map<string, Row>
  reflections: Row[]
  favorites: Set<string>
  streak: Row | null
}

interface PullContentPayload {
  server_time: string
  today: string | null
  rounds: Row[]
  books: Row[]
  days: Row[]
  summary_questions: Row[]
  completions: Row[]
  reflections: Row[]
  favorites: Row[]
  streak: Row | null
}

let state: WebStoreState | null = null
let loading: Promise<WebStoreState> | null = null

function hydrate(payload: PullContentPayload): WebStoreState {
  const completions = new Map<string, Row>()
  for (const c of payload.completions ?? []) {
    completions.set(String(c.devotion_day_id), c)
  }
  const favorites = new Set<string>(
    (payload.favorites ?? []).map((f) => String(f.devotion_day_id)),
  )
  return {
    serverTime: payload.server_time,
    today: payload.today,
    rounds: payload.rounds ?? [],
    books: payload.books ?? [],
    days: payload.days ?? [],
    summaryQuestions: payload.summary_questions ?? [],
    completions,
    reflections: payload.reflections ?? [],
    favorites,
    streak: payload.streak ?? null,
  }
}

async function load(): Promise<WebStoreState> {
  const { data, error } = await supabase.rpc('pull_content', { p_since: null })
  if (error) throw error
  log.info('webStore', 'pulled content', { days: (data as PullContentPayload).days?.length ?? 0 })
  return hydrate(data as PullContentPayload)
}

/** Returns the cached state, loading it once on first call. */
export function getStore(): Promise<WebStoreState> {
  if (state) return Promise.resolve(state)
  loading ??= load()
    .then((s) => {
      state = s
      loading = null
      return s
    })
    .catch((error: unknown) => {
      loading = null
      throw error
    })
  return loading
}

/** Forces a fresh pull, replacing the cache. */
export async function refreshStore(): Promise<WebStoreState> {
  state = null
  loading = null
  return getStore()
}

/** Drops the cache without refetching — used on sign-out. */
export function clearStore(): void {
  state = null
  loading = null
}

export type OutboxEntity = 'completion' | 'reflection' | 'favorite' | 'prayer_session'

interface SyncOutboxResult {
  applied: number
  skipped: number
  rejected: Array<{ client_id: string; reason: string }>
  today: string
  server_time: string
  streak: Row | null
}

/**
 * Apply one mutation immediately via the same `sync_outbox` RPC the phone's outbox
 * flushes batches to. There is nothing to retry here — if this throws, the caller's
 * write failed and should surface that, since there is no local copy backing it up.
 */
export async function applyOutboxItem(
  entity: OutboxEntity,
  payload: Record<string, unknown>,
  op: 'upsert' | 'delete' = 'upsert',
): Promise<SyncOutboxResult> {
  const clientId = crypto.randomUUID()
  const { data, error } = await supabase.rpc('sync_outbox', {
    p_items: [{ client_id: clientId, entity, op, payload }],
  })
  if (error) throw error

  const result = data as SyncOutboxResult
  const rejection = result.rejected?.find((r) => r.client_id === clientId)
  if (rejection) throw new Error(`${entity} rejected: ${rejection.reason}`)
  return result
}
