-- Abide — Phase 6. The notification ladder.
--
-- Twelve rungs, every one admin-configurable and user-disableable, with copy that
-- is content rather than code. The whole point of the ladder is that it is safe to
-- turn on, and the thing that makes it safe is the cap: at most two non-broadcast
-- notifications per person per day, chosen by priority.
--
-- Planning and sending are separate. `plan_notifications` decides *what* should
-- reach whom on a given ministry date and writes it down; delivery reads that and
-- talks to FCM. Keeping the decision in SQL is what lets a whole month be simulated
-- in a test rather than waited for.

create type notification_kind as enum (
  'daily_reminder',
  'streak_at_risk',
  'streak_lost',
  'repair_available',
  'comeback_d3',
  'comeback_d7',
  'comeback_d14',
  'milestone',
  'book_complete',
  'round_start',
  'broadcast'
);

/**
 * Lower is more important. When the cap bites, this decides who wins.
 *
 * Actionable and time-limited beats celebratory, which beats informational, which
 * beats re-engagement. A person about to lose a streak they can still save needs
 * that message more than they need to be told a new round started.
 */
create or replace function notification_priority(p_kind notification_kind)
  returns int language sql immutable as $fn$
  select case p_kind
    when 'streak_at_risk'   then 10
    when 'repair_available' then 20
    when 'daily_reminder'   then 30
    when 'milestone'        then 40
    when 'book_complete'    then 50
    when 'round_start'      then 60
    when 'streak_lost'      then 70
    when 'comeback_d3'      then 80
    when 'comeback_d7'      then 81
    when 'comeback_d14'     then 82
    when 'broadcast'        then 5
  end
$fn$;

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  kind           notification_kind not null,
  priority       int not null,
  -- The EAT day this belongs to. The cap counts per user per one of these.
  ministry_date  date not null,
  -- When it should actually leave, in UTC.
  send_at        timestamptz not null,
  title_en       text not null,
  title_am       text not null,
  body_en        text not null,
  body_am        text not null,
  -- Which template variant was chosen, so rotation can be seen and audited.
  variant        int not null default 0,
  meta           jsonb not null default '{}'::jsonb,
  /*
   * One notification of a kind per user per day, always. Planning is therefore
   * idempotent: running it twice, or re-running after a correction, cannot
   * double-send.
   */
  dedupe_key     text not null,
  suppressed_by  text,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index notifications_pending on notifications (send_at)
  where sent_at is null and suppressed_by is null;
create index notifications_user_day on notifications (user_id, ministry_date);

alter table notifications enable row level security;

-- A person may read what was sent to them, and nothing else. Admins see counts
-- through functions, never rows.
create policy notifications_own on notifications for select to authenticated
  using (user_id = auth.uid());

-- Broadcasts need a sent marker and a target the planner can read.
alter table broadcasts
  add column kind notification_kind not null default 'broadcast',
  add column status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sent', 'cancelled'));

/**
 * Which template copy to use, rotating between variants so the same words do not
 * arrive every single night.
 *
 * `variants` is an array of {title_en, title_am, body_en, body_am}. The base
 * columns are variant 0, so a template with no variants still works.
 */
create or replace function pick_template(
  p_ministry uuid,
  p_kind notification_kind,
  p_seed int
) returns table (title_en text, title_am text, body_en text, body_am text, variant int)
  language plpgsql stable as $fn$
declare
  t notification_templates;
  v jsonb;
  n int;
  idx int;
begin
  select * into t from notification_templates
   where ministry_id = p_ministry and kind = p_kind::text and enabled;

  if t is null then
    return;
  end if;

  n := coalesce(jsonb_array_length(t.variants), 0);
  -- Variant 0 is the template's own copy; 1..n are the alternatives.
  idx := p_seed % (n + 1);

  if idx = 0 then
    return query select t.title_en, t.title_am, t.body_en, t.body_am, 0;
    return;
  end if;

  v := t.variants -> (idx - 1);
  return query select
    coalesce(v ->> 'title_en', t.title_en),
    coalesce(v ->> 'title_am', t.title_am),
    coalesce(v ->> 'body_en', t.body_en),
    coalesce(v ->> 'body_am', t.body_am),
    idx;
end;
$fn$;

/** A kind is on unless the admin disabled it globally or the user did personally. */
create or replace function notification_enabled(
  p_user uuid,
  p_ministry uuid,
  p_kind notification_kind
) returns boolean language sql stable as $fn$
  select
    coalesce((select enabled from notification_templates
               where ministry_id = p_ministry and kind = p_kind::text), true)
    and
    coalesce((select enabled from notification_prefs
               where user_id = p_user and kind = p_kind::text), true)
$fn$;
