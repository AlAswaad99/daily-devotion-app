/**
 * The local schema, as a plain string with no imports.
 *
 * Kept separate from the code that opens the database so it can be executed by a
 * plain SQLite in tests — the write path that broke in Phase 3 had no coverage
 * precisely because everything lived behind `expo-sqlite`.
 */
export const SCHEMA = `
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

/*
 * Keyed by question as well as day: a summary day has three or four questions and
 * each gets its own field. Ordinal 0 means the day itself, which is what every
 * devotion day uses.
 */
create table if not exists reflections (
  devotion_day_id text not null,
  question_ordinal integer not null default 0,
  body            text not null,
  updated_at      text not null,
  pending         integer not null default 0,
  primary key (devotion_day_id, question_ordinal)
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

/*
 * The reader's own marks: highlights and bookmarks, keyed by canonical reference
 * rather than by translation, so switching reader language keeps them. They are
 * device-local — the spec does not sync them, and a highlight is closer to a dog-ear
 * than to a reflection.
 */
create table if not exists highlights (
  book    integer not null,
  chapter integer not null,
  verse   integer not null,
  primary key (book, chapter, verse)
);

create table if not exists bookmarks (
  book       integer not null,
  chapter    integer not null,
  created_at text not null,
  primary key (book, chapter)
);

/*
 * Prayer sessions, written locally first like everything else.
 *
 * `pending` marks a row the outbox has not yet flushed. The id is generated here, so
 * the server recognises a replayed flush instead of recording the same prayer twice.
 */
create table if not exists prayer_sessions (
  id               text primary key,
  started_at       text not null,
  ended_at         text,
  duration_seconds integer not null default 0,
  completed        integer not null default 0,
  interruptions    integer not null default 0,
  pending          integer not null default 0
);

create index if not exists prayer_sessions_started on prayer_sessions (started_at desc);
`
