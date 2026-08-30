-- Abide — broadcasts that schedule, target, and speak to one person at a time.
--
-- Three changes, and the first is the one the rest depend on.
--
-- 1. A broadcast stays ONE row until it comes due. `send_broadcast` used to write a
--    notification per member the moment an admin hit Send, even for a future
--    `scheduled_at`. That froze the audience and the copy at authoring time: target
--    "streak >= 7" on Monday for a Friday send and you reach Monday's members with
--    Monday's numbers. Fan-out now happens at send time, so the message says what is
--    true when it lands, and editing or cancelling touches one row.
--
-- 2. Copy is rendered per recipient, in their own language.
--
-- 3. Admins get reusable templates of their own — kept separate from the existing
--    `notification_templates`, which is the ladder's own voice and is not theirs to
--    rewrite by accident.

-- ---------------------------------------------------------------- audience, unbound
/*
 * `broadcast_audience` resolves the ministry from the caller's JWT, which is right
 * for the dashboard and impossible for the dispatcher: pg_cron has no session and no
 * `auth.uid()`. The ministry has to be passed in.
 *
 * The old one-argument signature stays as a wrapper so existing callers keep working.
 */
create or replace function broadcast_audience(p_target jsonb, p_ministry uuid)
  returns table (user_id uuid)
  language sql stable security definer set search_path = public as $fn$
  select p.id
  from profiles p
  left join streak_state s on s.user_id = p.id
  where p.ministry_id = p_ministry
    and (
      p_target -> 'recipient_id' is null
      or p.id = (p_target ->> 'recipient_id')::uuid
    )
    and (
      p_target -> 'active_within_days' is null
      or exists (
        select 1 from day_completions c
        join devotion_days d on d.id = c.devotion_day_id
        where c.user_id = p.id
          and d.scheduled_date >= ministry_today()
            - (p_target ->> 'active_within_days')::int
      )
    )
    and (
      p_target -> 'book_id' is null
      or exists (
        select 1 from day_completions c
        join devotion_days d on d.id = c.devotion_day_id
        where c.user_id = p.id and d.book_id = (p_target ->> 'book_id')::uuid
      )
    )
    and (
      p_target -> 'streak_at_least' is null
      or coalesce(s.current, 0) >= (p_target ->> 'streak_at_least')::int
    )
    and (
      p_target -> 'streak_below' is null
      or coalesce(s.current, 0) < (p_target ->> 'streak_below')::int
    )
$fn$;

create or replace function broadcast_audience(p_target jsonb)
  returns table (user_id uuid)
  language sql stable security definer set search_path = public as $fn$
  select * from broadcast_audience(p_target, auth_ministry_id())
$fn$;

-- ------------------------------------------------------------------ the variables
/**
 * What a member's placeholders resolve to right now.
 *
 * A key is absent — not null, absent — when it has no honest value: no streak, no
 * book in progress, never read a day. `render_notification_copy` uses that absence
 * to drop the sentence rather than print a zero.
 */
create or replace function notification_variables(p_user uuid, p_lang language)
  returns jsonb
  language sql stable security definer set search_path = public as $fn$
  with me as (
    select p.id, p.display_name, coalesce(s.current, 0) as streak
    from profiles p
    left join streak_state s on s.user_id = p.id
    where p.id = p_user
  ),
  latest as (
    select d.book_id, d.day_number, d.scheduled_date
    from day_completions c
    join devotion_days d on d.id = c.devotion_day_id
    where c.user_id = p_user
    order by d.scheduled_date desc
    limit 1
  )
  select
    -- `{name}` is the one variable that always resolves: a member with no display
    -- name is greeted, not skipped.
    jsonb_build_object(
      'name',
      coalesce(nullif(trim(me.display_name), ''),
               case when p_lang = 'am' then 'ወዳጄ' else 'friend' end)
    )
    || case when me.streak > 0
            then jsonb_build_object('streak', me.streak::text) else '{}'::jsonb end
    || case when b.id is not null
            then jsonb_build_object(
                   'book', case when p_lang = 'am' then b.title_am else b.title_en end)
            else '{}'::jsonb end
    || case when latest.day_number is not null
            then jsonb_build_object('day', latest.day_number::text) else '{}'::jsonb end
    || case when latest.scheduled_date is not null
            then jsonb_build_object(
                   'last_read', (ministry_today() - latest.scheduled_date)::text)
            else '{}'::jsonb end
  from me
  left join latest on true
  left join books b on b.id = latest.book_id
$fn$;

/**
 * Fill a message in for one member, dropping what cannot be said truthfully.
 *
 * A sentence holding a placeholder with no value is removed whole. The alternative —
 * substituting a zero — produces "You are on a 0 day streak, keep going", which is
 * worse than saying nothing, and there is no wording of it that is not worse.
 *
 * Sentences end at `.`, `!`, `?` or `።`, the Ethiopic full stop. Amharic copy is the
 * half least likely to be proofread by whoever changes this next, so it is handled
 * first-class rather than as an afterthought.
 *
 * Returns null when every sentence had to go: that member is then skipped entirely
 * rather than sent an empty notification.
 */
create or replace function render_notification_copy(p_text text, p_vars jsonb)
  returns text
  language plpgsql immutable set search_path = public as $fn$
declare
  v_marked text;
  v_sentence text;
  v_key text;
  v_keeps text[] := '{}';
  v_keep boolean;
  v_out text;
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;

  -- Postgres has no lookbehind, so mark the boundaries first and split on the mark.
  -- The marker is built with chr(1) rather than written inline: an escaped \x01
  -- inside the replacement string is passed through literally, which silently makes
  -- the whole message one sentence and drops all of it.
  v_marked := regexp_replace(p_text, '([.!?።])(\s+|$)', E'\\1' || chr(1), 'g');

  foreach v_sentence in array string_to_array(v_marked, chr(1)) loop
    if btrim(v_sentence) = '' then
      continue;
    end if;

    v_keep := true;
    for v_key in
      select m[1] from regexp_matches(v_sentence, '\{([a-z_]+)\}', 'g') as m
    loop
      if p_vars -> v_key is null then
        v_keep := false;
      end if;
    end loop;

    if v_keep then
      v_keeps := v_keeps || btrim(v_sentence);
    end if;
  end loop;

  if array_length(v_keeps, 1) is null then
    return null;
  end if;

  v_out := array_to_string(v_keeps, ' ');

  for v_key in select jsonb_object_keys(p_vars) loop
    v_out := replace(v_out, '{' || v_key || '}', p_vars ->> v_key);
  end loop;

  return v_out;
end;
$fn$;

-- ----------------------------------------------------------------- admin templates
/*
 * Reusable copy an admin writes, distinct from `notification_templates` — that table
 * is the ladder's own wording, keyed by kind, and rewriting it changes what the app
 * says on its own. These are the admin's to create and delete freely.
 */
create table if not exists broadcast_templates (
  id uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministries(id) on delete cascade,
  name text not null,
  title_en text not null default '',
  title_am text not null default '',
  body_en text not null default '',
  body_am text not null default '',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ministry_id, name)
);

alter table broadcast_templates enable row level security;

drop policy if exists broadcast_templates_admin on broadcast_templates;
create policy broadcast_templates_admin on broadcast_templates
  for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

-- ------------------------------------------------------------------- the broadcast
alter table broadcasts
  add column if not exists template_id uuid references broadcast_templates(id) on delete set null,
  add column if not exists dispatched_at timestamptz;

/*
 * `sending` is new: it marks a broadcast the dispatcher has claimed, so two
 * overlapping runs cannot fan the same one out twice.
 */
alter table broadcasts drop constraint if exists broadcasts_status_check;
alter table broadcasts add constraint broadcasts_status_check
  check (status = any (array['draft', 'scheduled', 'sending', 'sent', 'cancelled']));
