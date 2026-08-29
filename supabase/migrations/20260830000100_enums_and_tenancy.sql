-- Abide — Phase 0. Enums and tenancy.
-- Every content and progress table carries church_id from day one. There is one
-- church today; retrofitting tenancy later would be brutal and an unused column
-- costs nothing.

create extension if not exists "pgcrypto";

create type language          as enum ('en', 'am');
create type part_of_day       as enum ('morning', 'afternoon', 'evening', 'night');
create type user_role         as enum ('user', 'admin');
create type round_status      as enum ('draft', 'published', 'archived');
create type content_status    as enum ('draft', 'in_review', 'published', 'archived');
create type day_kind          as enum ('devotion', 'summary');
create type completion_method as enum ('live', 'backfill', 'repair');
create type streak_event_kind as enum ('extended', 'broken', 'repaired', 'frozen');

create table churches (
  id         uuid primary key default gen_random_uuid(),
  name_en    text not null,
  name_am    text not null,
  created_at timestamptz not null default now()
);

create table ministries (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references churches (id) on delete cascade,
  name_en    text not null,
  name_am    text not null,
  created_at timestamptz not null default now()
);
create index ministries_church_idx on ministries (church_id);

create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  church_id       uuid not null references churches (id),
  ministry_id     uuid not null references ministries (id),
  display_name    text not null,
  ui_language     language not null default 'am',
  -- Independent of ui_language: read scripture in Amharic, use the app in English.
  reader_language language not null default 'am',
  part_of_day     part_of_day not null default 'morning',
  -- Derived from part_of_day at signup, then user-editable. Local time, EAT.
  reminder_at     time not null default '06:00',
  timezone        text not null default 'Africa/Addis_Ababa',
  -- role is a column, not a boolean, so content_editor/publisher slot in later.
  role            user_role not null default 'user',
  -- The late-joiner boundary: days scheduled before this are excluded from streak math.
  joined_on       date not null default (now() at time zone 'Africa/Addis_Ababa')::date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_ministry_idx on profiles (ministry_id);

create table join_codes (
  code        text primary key,
  ministry_id uuid not null references ministries (id) on delete cascade,
  expires_at  timestamptz,
  max_uses    int not null default 100 check (max_uses > 0),
  uses        int not null default 0 check (uses >= 0),
  created_at  timestamptz not null default now()
);
