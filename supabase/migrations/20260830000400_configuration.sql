-- Abide — Phase 0. Configuration the ministry owns, plus device registration.
-- These tables are created now so RLS is written once; their features land later.

create table content_strings (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  category    text not null check (category in ('greeting', 'motivation')),
  part_of_day part_of_day,
  text_en     text not null,
  text_am     text not null,
  active      boolean not null default true
);

create table notification_templates (
  id             uuid primary key default gen_random_uuid(),
  ministry_id    uuid not null references ministries (id) on delete cascade,
  kind           text not null,
  enabled        boolean not null default true,
  offset_minutes int not null default 0,
  title_en       text not null,
  title_am       text not null,
  body_en        text not null,
  body_am        text not null,
  variants       jsonb not null default '[]'::jsonb,
  unique (ministry_id, kind)
);

create table notification_prefs (
  user_id uuid not null references profiles (id) on delete cascade,
  kind    text not null,
  enabled boolean not null default true,
  primary key (user_id, kind)
);

create table broadcasts (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministries (id) on delete cascade,
  target       jsonb not null default '{}'::jsonb,
  title_en     text not null,
  title_am     text not null,
  body_en      text not null,
  body_am      text not null,
  scheduled_at timestamptz,
  sent_at      timestamptz,
  created_by   uuid references profiles (id)
);

create table app_icon_rules (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries (id) on delete cascade,
  icon_key    text not null,
  condition   jsonb not null default '{}'::jsonb,
  priority    int not null default 0
);

create table devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  fcm_token   text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  app_version text not null default '',
  last_seen   timestamptz not null default now()
);

create table content_revisions (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references churches (id),
  entity_type  text not null,
  entity_id    uuid not null,
  payload      jsonb not null,
  author_id    uuid references profiles (id),
  status       content_status not null default 'draft',
  reviewed_by  uuid references profiles (id),
  published_at timestamptz,
  created_at   timestamptz not null default now()
);
create index content_revisions_entity_idx on content_revisions (entity_type, entity_id);
