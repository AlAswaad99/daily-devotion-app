import * as SQLite from 'expo-sqlite'
import { log } from '../lib/log'
import { SCHEMA } from './schema'

/**
 * The local database. Everything the app renders comes from here, online or not —
 * the network only ever fills it in the background. That is what makes a week in
 * airplane mode ordinary rather than a special mode.
 *
 * Content rows mirror the server's shape closely enough that the sync code stays
 * dull. Deliberately: fifty-three days of devotions is well under a megabyte, so
 * there is no partial-sync engine to get wrong.
 */


/**
 * Memoise the *promise*, not the resolved handle. Assigning after the await let two
 * concurrent callers each open their own connection — which is exactly what
 * happened, and is why writes and reads could end up on different handles.
 */
let opening: Promise<SQLite.SQLiteDatabase> | null = null

/**
 * Local schema version. Bump when the shape changes, and add the step below.
 *
 * Everything in this database is either content or a copy of server state, both of
 * which a pull restores — and anything not yet synced lives in the outbox, which
 * migrations must therefore never drop.
 */
const SCHEMA_VERSION = 2

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('pragma user_version')
  const from = row?.user_version ?? 0
  if (from === SCHEMA_VERSION) return

  log.info('db', `migrating local schema ${from} -> ${SCHEMA_VERSION}`)

  if (from < 2) {
    // Reflections gained a question ordinal in their primary key, which SQLite
    // cannot alter in place. Safe to recreate: synced rows come back on the next
    // pull, and unsynced edits are in the outbox, not here.
    await db.execAsync('drop table if exists reflections')
    await db.execAsync(SCHEMA)
    // Force a full pull so the dropped rows are restored.
    await db.runAsync("delete from meta where key = 'last_pull_at'")
  }

  await db.execAsync(`pragma user_version = ${SCHEMA_VERSION}`)
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync('abide.db')
    await db.execAsync(SCHEMA)
    await migrate(db)
    log.info('db', 'local database ready')
    return db
  })().catch((error: unknown) => {
    // A failed open must not be cached, or the app can never recover.
    opening = null
    throw error
  })
  return opening
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ value: string }>(
    'select value from meta where key = ?',
    key,
  )
  return row?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    'insert into meta (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
    key,
    value,
  )
}

/**
 * Signing out must not leave the previous account's reading history on the device
 * for the next person to see.
 */
export async function clearLocalData(): Promise<void> {
  const db = await getDatabase()
  await db.execAsync(`
    delete from day_completions;
    delete from reflections;
    delete from favorites;
    delete from outbox;
    delete from meta;
  `)
  log.info('db', 'cleared local user data')
}

export const META_LAST_PULL = 'last_pull_at'
export const META_TODAY = 'ministry_today'
export const META_SERVER_TIME = 'server_time'
export const META_STREAK = 'server_streak'
