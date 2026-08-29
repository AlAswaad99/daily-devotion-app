-- Abide — Phase 0. Progress, the streak ledger, and private user writing.

create table day_completions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  devotion_day_id  uuid not null references devotion_days (id) on delete cascade,
  completed_at     timestamptz not null default now(),
  -- Only 'live' and 'repair' ever set this. Backfill marks the day done everywhere
  -- it is displayed, but the streak stays broken.
  counted_for_streak boolean not null default false,
  method           completion_method not null default 'live',
  reading_seconds  int not null default 0 check (reading_seconds >= 0),
  scroll_depth     real not null default 0 check (scroll_depth between 0 and 1),
  -- Tapped through the "finished already?" prompt. Analytics signal, never a penalty.
  confirmed_early  boolean not null default false,
  unique (user_id, devotion_day_id),
  check (method <> 'backfill' or counted_for_streak = false)
);
create index day_completions_user_idx on day_completions (user_id, completed_at);

-- Append-only ledger. The streak is always reconstructible from this plus completions.
create table streak_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  kind           streak_event_kind not null,
  occurred_at    timestamptz not null default now(),
  scheduled_date date not null,
  meta           jsonb not null default '{}'::jsonb
);
create index streak_events_user_idx on streak_events (user_id, scheduled_date);

-- Cache. Derivable from the ledger, droppable and rebuildable. Never the source of truth.
create table streak_state (
  user_id           uuid primary key references profiles (id) on delete cascade,
  current           int not null default 0 check (current >= 0),
  best              int not null default 0 check (best >= 0),
  last_counted_date date,
  repair_credits    int not null default 1 check (repair_credits >= 0),
  updated_at        timestamptz not null default now()
);

-- Private to its author. See the RLS migration: no admin bypass exists for this table.
create table reflections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles (id) on delete cascade,
  devotion_day_id uuid not null references devotion_days (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, devotion_day_id)
);

create table favorites (
  user_id         uuid not null references profiles (id) on delete cascade,
  devotion_day_id uuid not null references devotion_days (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, devotion_day_id)
);

-- Prayer is tracked and shown, but is never a streak condition.
create table prayer_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles (id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  completed        boolean not null default false,
  interruptions    int not null default 0 check (interruptions >= 0)
);
create index prayer_sessions_user_idx on prayer_sessions (user_id, started_at);
