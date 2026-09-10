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
const SCHEMA_VERSION = 5

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

  if (from < 3) {
    // Phase 7 added the reader's highlights and bookmarks. Both are created by
    // `SCHEMA` above with `if not exists`, so there is nothing to move — the bump
    // exists so the version reflects the shape.
    await db.execAsync(SCHEMA)
  }

  if (from < 4) {
    // Phase 8 added prayer sessions. Created by `SCHEMA` with `if not exists`, so
    // there is nothing to move.
    await db.execAsync(SCHEMA)
  }

  if (from < 5) {
    // Future days are now synced too (locked, topic-only) instead of withheld
    // entirely — an existing devotion_days table predates the column `SCHEMA`'s
    // `create table if not exists` will not add for it. A brand-new install
    // (from === 0) has no existing table to patch: `execAsync(SCHEMA)` above
    // already created it with the column, and re-adding it here would fail
    // with "duplicate column name" — which stalled every later local-db read
    // behind this migration's never-settling promise.
    const columns = await db.getAllAsync<{ name: string }>('pragma table_info(devotion_days)')
    if (!columns.some((c) => c.name === 'locked')) {
      await db.execAsync('alter table devotion_days add column locked integer not null default 0')
    }
    // Every row synced so far is a day that had already arrived (the old rule),
    // so pulling everything once is what actually populates the future ones.
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
  `)
  // Only the keys that belong to the departing account. The ministry's date is not
  // theirs, and dropping it left the next launch unable to say what today was.
  await db.runAsync(
    `delete from meta where key in (?, ?, ?)`,
    META_LAST_PULL, META_STREAK, 'profile',
  )
  log.info('db', 'cleared local user data')
}

export const META_LAST_PULL = 'last_pull_at'
export const META_TODAY = 'ministry_today'
export const META_SERVER_TIME = 'server_time'
export const META_STREAK = 'server_streak'
