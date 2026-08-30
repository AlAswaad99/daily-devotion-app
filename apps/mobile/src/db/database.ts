import * as SQLite from 'expo-sqlite'
import { log } from '../lib/log'

/**
 * The local database. Everything the app renders comes from here, online or not —
 * the network only ever fills it in the background. That is what makes a week in
 * airplane mode ordinary rather than a special mode.
 *
 * Content rows mirror the server's shape closely enough that the sync code stays
 * dull. Deliberately: fifty-three days of devotions is well under a megabyte, so
 * there is no partial-sync engine to get wrong.
 */

const SCHEMA = `
pragma journal_mode = WAL;

create table if not exists rounds (
  id            text primary key,
  phase_code    text not null,
  round_code    text not null,
  main_verse_en text not null default '',
  main_verse_am text not null default '',
  starts_on     text,
  status        text not null,
  updated_at    text
);

create table if not exists books (
  id         text primary key,
  round_id   text not null,
  sequence   integer not null,
  source_id  text not null,
  title_en   text not null,
  title_am   text not null,
  status     text not null,
  updated_at text
);

create table if not exists devotion_days (
  id               text primary key,
  book_id          text not null,
  day_number       integer not null,
  kind             text not null,
  topic_en         text not null,
  topic_am         text not null,
  purpose_en       text not null,
  purpose_am       text not null,
  prayer_en        text not null,
  prayer_am        text not null,
  passage          text,
  key_verses       text not null default '[]',
  cross_refs       text not null default '[]',
  expected_seconds integer not null default 90,
  scheduled_date   text,
  updated_at       text
);
create index if not exists devotion_days_date on devotion_days (scheduled_date);

create table if not exists summary_questions (
  id          text primary key,
  book_id     text not null,
  ordinal     integer not null,
  question_en text not null,
  question_am text not null
);

create table if not exists day_completions (
  devotion_day_id    text primary key,
  method             text not null,
  counted_for_streak integer not null default 0,
  completed_at       text,
  reading_seconds    integer not null default 0,
  scroll_depth       real not null default 0,
  /* Set for rows this device queued but the server has not confirmed yet. */
  pending            integer not null default 0
);

create table if not exists reflections (
  devotion_day_id text primary key,
  body            text not null,
  updated_at      text not null,
  pending         integer not null default 0
);

create table if not exists favorites (
  devotion_day_id text primary key,
  pending         integer not null default 0
);

/*
 * The outbox. Ordered by insertion, at-least-once, and every row carries the
 * client-generated id the server de-duplicates on, so a retry cannot double-apply.
 */
create table if not exists outbox (
  id               integer primary key autoincrement,
  client_id        text not null unique,
  entity           text not null,
  op               text not null default 'upsert',
  payload          text not null,
  local_created_at text not null,
  attempts         integer not null default 0,
  last_error       text
);

/* Single-row key/value for sync bookkeeping: last pull cursor, cached today. */
create table if not exists meta (
  key   text primary key,
  value text
);
`

let database: SQLite.SQLiteDatabase | null = null

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database
  database = await SQLite.openDatabaseAsync('abide.db')
  await database.execAsync(SCHEMA)
  log.info('db', 'local database ready')
  return database
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
