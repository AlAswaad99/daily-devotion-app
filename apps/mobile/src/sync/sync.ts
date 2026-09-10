import * as Network from 'expo-network'
import { supabase } from '../lib/supabase'
import { log } from '../lib/log'
import { markSynced, storePulled, type PrayerSession as PrayerSessionRow } from '../data/prayer'
import {
  getDatabase, getMeta, setMeta, META_LAST_PULL, META_SERVER_TIME, META_STREAK, META_TODAY,
} from '../db/database'
import { pending, recordFailure, reject, remove } from './outbox'

/**
 * One sync: flush what we owe the server, then pull what changed.
 *
 * Flush first. If a completion is sitting in the outbox and we pulled first, the
 * pull would return content that does not know about it and the UI would flicker
 * backwards before flickering forwards again.
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

/**
 * Automatic syncs are debounced. Foreground events and screen focus can fire in
 * quick succession, and these users are on metered mobile data — repeating a pull
 * seven times in ten seconds costs them money for nothing. An explicit
 * pull-to-refresh passes `force`.
 */
export const MIN_AUTO_SYNC_MS = 30_000

export async function isOnline(): Promise<boolean> {
  try {
    const state = await Network.getNetworkStateAsync()
    return Boolean(state.isConnected && state.isInternetReachable !== false)
  } catch {
    // If we cannot tell, assume we are online and let the request fail honestly.
    return true
  }
}

/** Concurrent callers share one run rather than racing each other's writes. */
export function syncNow(options: { force?: boolean; full?: boolean } = {}): Promise<SyncResult> {
  if (inFlight) return inFlight

  const since = Date.now() - lastCompleted
  if (!options.force && since < MIN_AUTO_SYNC_MS) {
    return Promise.resolve({
      ok: true, flushed: 0, pulled: 0, today: null, reason: 'debounced',
    })
  }

  inFlight = run(options.full ?? false).finally(() => {
    inFlight = null
    lastCompleted = Date.now()
  })
  return inFlight
}

async function run(full: boolean): Promise<SyncResult> {
  if (!(await isOnline())) {
    log.info('sync', 'offline; staying with local data')
    return {
      ok: false, flushed: 0, pulled: 0, today: await getMeta(META_TODAY), reason: 'offline',
    }
  }

  let flushed = 0
  try {
    flushed = await flush()
  } catch (error) {
    log.error('sync', 'flush failed', error)
    return { ok: false, flushed: 0, pulled: 0, today: await getMeta(META_TODAY), reason: 'flush' }
  }

  try {
    const pulled = await pull(full)
    return { ok: true, flushed, pulled, today: await getMeta(META_TODAY) }
  } catch (error) {
    log.error('sync', 'pull failed', error)
    return { ok: false, flushed, pulled: 0, today: await getMeta(META_TODAY), reason: 'pull' }
  }
}

async function flush(): Promise<number> {
  const items = await pending()
  if (items.length === 0) return 0

  log.info('sync', `flushing ${items.length} queued item(s)`)
  const { data, error } = await supabase.rpc('sync_outbox', {
    p_items: items.map((i) => ({
      client_id: i.client_id,
      entity: i.entity,
      op: i.op,
      payload: i.payload,
    })),
  })

  if (error) {
    // A network or server failure: keep the items and count the attempt so a
    // permanently broken row eventually stops being retried.
    await recordFailure(items.map((i) => i.client_id), error.message)
    throw error
  }

  const result = data as {
    applied: number
    skipped: number
    rejected: Array<{ client_id: string; reason: string }>
    today: string
    server_time: string
    streak: unknown
  }
  log.result('sync', 'sync_outbox', { data: result })

  // Anything the server refused on its own terms will never succeed; drop it
  // rather than retrying until the end of time.
  const rejectedIds = (result.rejected ?? []).map((r) => r.client_id).filter(Boolean)
  await reject(rejectedIds, 'server rejected')

  const acceptedIds = items
    .map((i) => i.client_id)
    .filter((id) => !rejectedIds.includes(id))
  await remove(acceptedIds)

  /*
   * Clear `pending` on the prayer sessions that just landed. The outbox row is gone
   * either way, but the local session keeps the flag so the app can tell what the
   * server has actually seen — otherwise a reinstall's pull would be blocked from
   * correcting rows that were never really sent.
   */
  const prayed = items
    .filter((i) => i.entity === 'prayer_session' && !rejectedIds.includes(i.client_id))
    .map((i) => String((i.payload as { id?: string }).id ?? ''))
    .filter(Boolean)
  await markSynced(prayed)

  return acceptedIds.length
}

async function pull(full: boolean): Promise<number> {
  const db = await getDatabase()

  // The cursor is a claim that everything up to that point is already stored. If
  // the content tables are empty it was not, so ignore it and pull everything —
  // otherwise a single lost write leaves the app permanently empty, with the
  // server correctly reporting that nothing has changed since.
  //
  // `full` is the same escape hatch for a cursor that has quietly gone stale
  // rather than missing: the delta filter compares against a row's own
  // `updated_at`, and a caller that finds itself with cached content but nothing
  // for today despite that (`comingSoon` in `(tabs)/index.tsx`) cannot tell
  // "the round really ended" from "something this device cannot see changed" —
  // so it asks for everything once rather than trusting the cursor forever.
  const cached = await db.getFirstAsync<{ n: number }>('select count(*) as n from devotion_days')
  const stored = cached?.n ?? 0
  const since = stored > 0 && !full ? await getMeta(META_LAST_PULL) : null
  if (stored === 0) log.info('sync', 'no content cached; pulling everything')
  else if (full) log.info('sync', 'forcing a full pull')

  const { data, error } = await supabase.rpc('pull_content', { p_since: since })
  if (error) throw error

  /*
   * Prayer sessions come from their own function rather than `pull_content`, which
   * carries the ministry's content and this does not — it is the member's own record
   * and belongs to nobody else.
   */
  const { data: prayer, error: prayerError } = await supabase.rpc('pull_prayer_sessions', {
    p_since: since,
  })
  if (prayerError) {
    // Not fatal. Content is what the app needs to be usable; a missing prayer
    // history is a gap in a screen, not a broken app.
    log.info('sync', 'prayer sessions did not pull', { message: prayerError.message })
  } else {
    await storePulled((prayer ?? []) as PrayerSessionRow[])
  }

  const payload = data as {
    server_time: string
    today: string
    rounds: Row[]
    books: Row[]
    days: Row[]
    summary_questions: Row[]
    completions: Row[]
    reflections: Row[]
    favorites: Row[]
    streak: Row | null
  }

  log.info('sync', 'server returned', {
    days: payload.days?.length ?? 0,
    books: payload.books?.length ?? 0,
    rounds: payload.rounds?.length ?? 0,
    completions: payload.completions?.length ?? 0,
  })

  let count = 0

  // Deliberately not wrapped in a transaction. An interrupted pull leaving some
  // rows behind is harmless — every statement is an upsert and the next pull
  // repeats them. Losing the whole batch while still advancing the cursor is not
  // harmless, and that is what a rolled-back transaction did here.
  {
    for (const r of payload.rounds ?? []) {
      await db.runAsync(
        `insert into rounds (id, phase_code, round_code, main_verse_en, main_verse_am,
           starts_on, status, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           phase_code = excluded.phase_code, round_code = excluded.round_code,
           main_verse_en = excluded.main_verse_en, main_verse_am = excluded.main_verse_am,
           starts_on = excluded.starts_on, status = excluded.status,
           updated_at = excluded.updated_at`,
        str(r.id), str(r.phase_code), str(r.round_code), str(r.main_verse_en),
        str(r.main_verse_am), str(r.starts_on), str(r.status), str(r.updated_at),
      )
      count++
    }

    for (const b of payload.books ?? []) {
      await db.runAsync(
        `insert into books (id, round_id, sequence, source_id, title_en, title_am,
           status, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           round_id = excluded.round_id, sequence = excluded.sequence,
           source_id = excluded.source_id, title_en = excluded.title_en,
           title_am = excluded.title_am, status = excluded.status,
           updated_at = excluded.updated_at`,
        str(b.id), str(b.round_id), num(b.sequence), str(b.source_id), str(b.title_en),
        str(b.title_am), str(b.status), str(b.updated_at),
      )
      count++
    }

    for (const d of payload.days ?? []) {
      // A locked (not-yet-arrived) day's payload carries only id/book_id/day_number/
      // kind/topic/scheduled_date/updated_at/locked — the not-null content columns
      // need a real value regardless, not the `null` `str()` gives an absent field.
      await db.runAsync(
        `insert into devotion_days (id, book_id, day_number, kind, topic_en, topic_am,
           purpose_en, purpose_am, prayer_en, prayer_am, passage, key_verses, cross_refs,
           expected_seconds, scheduled_date, locked, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(id) do update set
           book_id = excluded.book_id, day_number = excluded.day_number,
           kind = excluded.kind, topic_en = excluded.topic_en, topic_am = excluded.topic_am,
           purpose_en = excluded.purpose_en, purpose_am = excluded.purpose_am,
           prayer_en = excluded.prayer_en, prayer_am = excluded.prayer_am,
           passage = excluded.passage, key_verses = excluded.key_verses,
           cross_refs = excluded.cross_refs, expected_seconds = excluded.expected_seconds,
           scheduled_date = excluded.scheduled_date, locked = excluded.locked,
           updated_at = excluded.updated_at`,
        str(d.id), str(d.book_id), num(d.day_number), str(d.kind), str(d.topic_en),
        str(d.topic_am), str(d.purpose_en) ?? '', str(d.purpose_am) ?? '',
        str(d.prayer_en) ?? '', str(d.prayer_am) ?? '', json(d.passage),
        json(d.key_verses) ?? '[]', json(d.cross_refs) ?? '[]',
        num(d.expected_seconds), str(d.scheduled_date), d.locked ? 1 : 0, str(d.updated_at),
      )
      count++
    }

    for (const q of payload.summary_questions ?? []) {
      await db.runAsync(
        `insert into summary_questions (id, book_id, ordinal, question_en, question_am)
         values (?, ?, ?, ?, ?)
         on conflict(id) do update set
           book_id = excluded.book_id, ordinal = excluded.ordinal,
           question_en = excluded.question_en, question_am = excluded.question_am`,
        str(q.id), str(q.book_id), num(q.ordinal), str(q.question_en), str(q.question_am),
      )
      count++
    }

    // The server's own record of progress replaces ours. Anything still in the
    // outbox is re-applied on the next flush, so nothing is lost by trusting it.
    for (const c of payload.completions ?? []) {
      await db.runAsync(
        `insert into day_completions (devotion_day_id, method, counted_for_streak,
           completed_at, reading_seconds, scroll_depth, pending)
         values (?, ?, ?, ?, ?, ?, 0)
         on conflict(devotion_day_id) do update set
           method = excluded.method, counted_for_streak = excluded.counted_for_streak,
           completed_at = excluded.completed_at, reading_seconds = excluded.reading_seconds,
           scroll_depth = excluded.scroll_depth, pending = 0`,
        str(c.devotion_day_id), str(c.method), c.counted_for_streak ? 1 : 0,
        str(c.completed_at), num(c.reading_seconds), num(c.scroll_depth),
      )
      count++
    }

    for (const f of payload.reflections ?? []) {
      await db.runAsync(
        `insert into reflections (devotion_day_id, question_ordinal, body, updated_at, pending)
         values (?, ?, ?, ?, 0)
         on conflict(devotion_day_id, question_ordinal) do update set
           body = excluded.body, updated_at = excluded.updated_at, pending = 0
         where excluded.updated_at > reflections.updated_at`,
        str(f.devotion_day_id), num(f.question_ordinal), str(f.body), str(f.updated_at),
      )
      count++
    }

    for (const v of payload.favorites ?? []) {
      await db.runAsync(
        `insert into favorites (devotion_day_id, pending) values (?, 0)
         on conflict(devotion_day_id) do update set pending = 0`,
        str(v.devotion_day_id),
      )
      count++
    }
  }

  // Advance the cursor only after the writes above have completed. It is a promise
  // that the data is stored, and must never be made before it is true.
  await setMeta(META_LAST_PULL, payload.server_time)
  await setMeta(META_SERVER_TIME, payload.server_time)
  await setMeta(META_TODAY, payload.today)
  // The server's own streak row, kept for the numbers only it knows — repair
  // credits cannot be derived from local rows.
  if (payload.streak) await setMeta(META_STREAK, JSON.stringify(payload.streak))

  log.info('sync', `pulled ${count} row(s)`, { today: payload.today, since })
  return count
}

type Row = Record<string, unknown>

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v))
const json = (v: unknown): string | null =>
  v === null || v === undefined ? null : JSON.stringify(v)
