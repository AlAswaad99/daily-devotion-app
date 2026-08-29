-- Abide — Phase 0. Content hierarchy: round → book → day.

create table rounds (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references churches (id),
  ministry_id   uuid not null references ministries (id) on delete cascade,
  phase_code    text not null,
  round_code    text not null,
  main_verse_en text not null default '',
  main_verse_am text not null default '',
  starts_on     date not null,
  status        round_status not null default 'draft',
  created_at    timestamptz not null default now(),
  unique (ministry_id, phase_code, round_code)
);

create table books (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references churches (id),
  round_id     uuid not null references rounds (id) on delete cascade,
  sequence     int not null check (sequence > 0),
  -- The identifier the ministry uses in its source JSON, e.g. 'BOOK 01'.
  source_id    text not null,
  title_en     text not null,
  title_am     text not null,
  status       content_status not null default 'draft',
  published_at timestamptz,
  created_at   timestamptz not null default now(),
  unique (round_id, sequence)
);

-- A book's closing questions are a real day with kind='summary': its own scheduled
-- date, counting toward the streak like any other. A ten-day study is eleven days.
create table devotion_days (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid not null references churches (id),
  book_id          uuid not null references books (id) on delete cascade,
  day_number       int not null check (day_number > 0),
  kind             day_kind not null default 'devotion',
  topic_en         text not null default '',
  topic_am         text not null default '',
  purpose_en       text not null default '',
  purpose_am       text not null default '',
  prayer_en        text not null default '',
  prayer_am        text not null default '',
  -- Canonical refs: { book: 1..66, chapter, verse_start, verse_end, chapter_end, raw }
  passage          jsonb,
  key_verses       jsonb not null default '[]'::jsonb,
  cross_refs       jsonb not null default '[]'::jsonb,
  -- English word count of topic+purpose+prayer at 200 wpm, 90s floor. Admin-overridable.
  expected_seconds int not null default 90 check (expected_seconds >= 90),
  expected_seconds_overridden boolean not null default false,
  -- Null until the book is published and scheduled.
  scheduled_date   date,
  status           content_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (book_id, day_number),
  check (jsonb_typeof(key_verses) = 'array'),
  check (jsonb_typeof(cross_refs) = 'array')
);
create index devotion_days_book_idx on devotion_days (book_id, day_number);

-- The whole ministry moves together, so at most one scheduled day per date per church.
create unique index devotion_days_one_per_date
  on devotion_days (church_id, scheduled_date)
  where scheduled_date is not null;

create table summary_questions (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references churches (id),
  book_id     uuid not null references books (id) on delete cascade,
  ordinal     int not null check (ordinal > 0),
  question_en text not null,
  question_am text not null,
  unique (book_id, ordinal)
);
