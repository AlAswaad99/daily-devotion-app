import * as Crypto from 'expo-crypto'
import { getDatabase } from '../db/database'
import { log } from '../lib/log'

/**
 * The outbox: every mutation is written locally first and queued here, then
 * flushed when there is a network. Ordered, idempotent, at-least-once.
 *
 * The client id is generated here, not by the server, which is what makes a retry
 * safe: the server has seen that id before and treats the repeat as a no-op.
 */

export type OutboxEntity = 'completion' | 'reflection' | 'favorite' | 'prayer_session'

export interface OutboxItem {
  id: number
  client_id: string
  entity: OutboxEntity
  op: string
  payload: Record<string, unknown>
  local_created_at: string
  attempts: number
  last_error: string | null
}

/** Items that have failed this many times are reported rather than retried forever. */
export const MAX_ATTEMPTS = 8

export async function enqueue(
  entity: OutboxEntity,
  payload: Record<string, unknown>,
  op: 'upsert' | 'delete' = 'upsert',
): Promise<string> {
  const db = await getDatabase()
  const clientId = Crypto.randomUUID()
  await db.runAsync(
    `insert into outbox (client_id, entity, op, payload, local_created_at)
     values (?, ?, ?, ?, ?)`,
    clientId,
    entity,
    op,
    JSON.stringify(payload),
    new Date().toISOString(),
  )
  log.info('outbox', `queued ${entity}`, { clientId, op })
  return clientId
}

export async function pending(limit = 200): Promise<OutboxItem[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{
    id: number
    client_id: string
    entity: OutboxEntity
    op: string
    payload: string
    local_created_at: string
    attempts: number
    last_error: string | null
  }>(
    // Oldest first: order is part of the contract, and a completion queued before
    // a reflection about it must arrive in that order.
    `select * from outbox where attempts < ? order by id asc limit ?`,
    MAX_ATTEMPTS,
    limit,
  )
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }))
}

export async function pendingCount(): Promise<number> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ n: number }>('select count(*) as n from outbox')
  return row?.n ?? 0
}

export async function remove(clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return
  const db = await getDatabase()
  const placeholders = clientIds.map(() => '?').join(',')
  await db.runAsync(`delete from outbox where client_id in (${placeholders})`, ...clientIds)
}

/**
 * A failure that is the server's verdict rather than a network problem — the day is
 * not available, the entity is unknown — must not be retried forever. Those are
 * dropped, with the reason logged.
 */
export async function reject(clientIds: string[], reason: string): Promise<void> {
  if (clientIds.length === 0) return
  log.info('outbox', `dropping ${clientIds.length} rejected item(s)`, { reason })
  await remove(clientIds)
}

export async function recordFailure(clientIds: string[], error: string): Promise<void> {
  if (clientIds.length === 0) return
  const db = await getDatabase()
  const placeholders = clientIds.map(() => '?').join(',')
  await db.runAsync(
    `update outbox set attempts = attempts + 1, last_error = ? where client_id in (${placeholders})`,
    error,
    ...clientIds,
  )
}

/** Items that have exhausted their retries, for the settings screen to surface. */
export async function stuck(): Promise<OutboxItem[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<OutboxItem & { payload: string }>(
    'select * from outbox where attempts >= ?',
    MAX_ATTEMPTS,
  )
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }))
}
