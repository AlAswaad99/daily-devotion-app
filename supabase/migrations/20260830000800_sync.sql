-- Abide — Phase 3. Offline sync.
--
-- Two problems have to be solved here, and they are different problems.
--
-- 1. At-least-once delivery. The outbox retries, so the same write can arrive
--    twice. Every mutation carries a client-generated UUID and the server treats a
--    repeat as a no-op rather than a second completion.
--
-- 2. A device that has been offline for a week is indistinguishable, from the
--    outside, from a device with its clock wound back — both claim to have
--    completed a day whose date has passed. See `plausible_live_claim` below for
--    the one thing the server can actually prove.

alter table day_completions
  -- Client-generated, so a retried write cannot double-apply.
  add column client_id uuid,
  -- Device time as claimed by the client, kept alongside the server's own
  -- completed_at. Never trusted, but worth keeping for audit.
  add column client_completed_at timestamptz;

create unique index day_completions_client_id on day_completions (client_id)
  where client_id is not null;

alter table profiles
  -- The last time this user's device provably reached the server. This is what
  -- makes clock-tampering detectable at all.
  add column last_synced_at timestamptz;

alter table reflections
  add column client_id uuid;
create unique index reflections_client_id on reflections (client_id)
  where client_id is not null;

-- Content needs a change marker so the client can pull a delta rather than
-- everything. Days already have updated_at; books and rounds did not.
alter table books  add column updated_at timestamptz not null default now();
alter table rounds add column updated_at timestamptz not null default now();

create trigger books_touch before update on books
  for each row execute function touch_updated_at();
create trigger rounds_touch before update on rounds
  for each row execute function touch_updated_at();

/**
 * Can this device honestly claim to have completed `p_date` on the day itself?
 *
 * The server cannot tell a genuinely offline week from a wound-back clock by
 * looking at the timestamp — both are just a number the device sent. But it knows
 * one thing the device cannot argue with: when that device last reached the server.
 *
 * If the claimed date is *before* the last successful sync, the device was online
 * after that date and did not report the completion then. The claim is false, and
 * the completion is recorded as a backfill instead of being rejected — the user
 * still gets credit for reading it, they just do not get the streak.
 */
create or replace function plausible_live_claim(
  p_user uuid,
  p_date date,
  p_claimed_at timestamptz
) returns boolean
  language sql stable security definer set search_path = public
as $fn$
  select
    -- The claim must be for the day's own date.
    p_claimed_at is not null
    and (p_claimed_at at time zone 'Africa/Addis_Ababa')::date = p_date
    -- Nothing may be completed in the future.
    and p_date <= ministry_today()
    -- And the device must not have been online after the date it is claiming.
    and coalesce(
      (select (last_synced_at at time zone 'Africa/Addis_Ababa')::date <= p_date
       from profiles where id = p_user),
      true
    )
$fn$;

/**
 * Apply a batch of queued mutations and return the authoritative state.
 *
 * Ordered, idempotent, at-least-once: the client may send the same item any number
 * of times. Each item is
 *   { client_id, entity: 'completion'|'reflection'|'favorite', op, payload }
 * and the whole batch runs in one transaction, so a partial flush cannot leave the
 * streak half-updated.
 */
create or replace function sync_outbox(p_items jsonb)
  returns jsonb
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_user      uuid := auth.uid();
  v_item      jsonb;
  v_client_id uuid;
  v_entity    text;
  v_day       uuid;
  v_date      date;
  v_claimed   timestamptz;
  v_method    completion_method;
  v_applied   int := 0;
  v_skipped   int := 0;
  v_rejected  jsonb := '[]'::jsonb;
  v_state     streak_state;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_client_id := (v_item ->> 'client_id')::uuid;
    v_entity    := v_item ->> 'entity';

    if v_entity = 'completion' then
      v_day     := (v_item -> 'payload' ->> 'devotion_day_id')::uuid;

      -- Already applied on an earlier attempt. At-least-once delivery means this
      -- is expected, not an error.
      if v_client_id is not null and exists (
        select 1 from day_completions where client_id = v_client_id
      ) then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      v_claimed := (v_item -> 'payload' ->> 'client_completed_at')::timestamptz;

      select s.scheduled_date into v_date from streak_days(v_user) s where s.id = v_day;
      if v_date is null then
        -- Not a day this user may complete. Report it so the client can drop the
        -- item rather than retrying forever.
        v_rejected := v_rejected || jsonb_build_object(
          'client_id', v_client_id, 'reason', 'day_not_available');
        continue;
      end if;

      -- A completion is 'live' only if the device can honestly claim the day.
      v_method := case
        when plausible_live_claim(v_user, v_date, v_claimed) then 'live'
        else 'backfill'
      end::completion_method;

      insert into day_completions as c (
        user_id, devotion_day_id, client_id, completed_at, client_completed_at,
        counted_for_streak, method, reading_seconds, scroll_depth, confirmed_early)
      values (
        v_user, v_day, v_client_id, now(), v_claimed,
        v_method = 'live', v_method,
        coalesce((v_item -> 'payload' ->> 'reading_seconds')::int, 0),
        least(greatest(coalesce((v_item -> 'payload' ->> 'scroll_depth')::real, 0), 0), 1),
        coalesce((v_item -> 'payload' ->> 'confirmed_early')::boolean, false))
      on conflict (user_id, devotion_day_id) do update
        -- Re-reading never downgrades: a repaired day stays repaired.
        set reading_seconds = greatest(c.reading_seconds,
              coalesce((v_item -> 'payload' ->> 'reading_seconds')::int, 0)),
            scroll_depth = greatest(c.scroll_depth,
              least(greatest(coalesce((v_item -> 'payload' ->> 'scroll_depth')::real, 0), 0), 1));

      v_applied := v_applied + 1;

    elsif v_entity = 'reflection' then
      -- Last write wins, compared on the client's own updated_at. The realistic
      -- conflict is one person editing the same reflection on two devices.
      insert into reflections as r (
        user_id, devotion_day_id, client_id, body, created_at, updated_at)
      values (
        v_user,
        (v_item -> 'payload' ->> 'devotion_day_id')::uuid,
        v_client_id,
        v_item -> 'payload' ->> 'body',
        coalesce((v_item -> 'payload' ->> 'updated_at')::timestamptz, now()),
        coalesce((v_item -> 'payload' ->> 'updated_at')::timestamptz, now()))
      on conflict (user_id, devotion_day_id) do update
        set body = excluded.body, updated_at = excluded.updated_at
        where excluded.updated_at > r.updated_at;
      v_applied := v_applied + 1;

    elsif v_entity = 'favorite' then
      if (v_item ->> 'op') = 'delete' then
        delete from favorites
        where user_id = v_user
          and devotion_day_id = (v_item -> 'payload' ->> 'devotion_day_id')::uuid;
      else
        insert into favorites (user_id, devotion_day_id)
        values (v_user, (v_item -> 'payload' ->> 'devotion_day_id')::uuid)
        on conflict do nothing;
      end if;
      v_applied := v_applied + 1;

    else
      v_rejected := v_rejected || jsonb_build_object(
        'client_id', v_client_id, 'reason', 'unknown_entity');
    end if;
  end loop;

  -- Record the contact *after* applying, so a device cannot be penalised by its
  -- own flush: items in this batch are judged against the previous sync.
  update profiles set last_synced_at = now() where id = v_user;

  v_state := refresh_streak_state(v_user);

  return jsonb_build_object(
    'applied', v_applied,
    'skipped', v_skipped,
    'rejected', v_rejected,
    'server_time', now(),
    'today', ministry_today(),
    'streak', to_jsonb(v_state));
end;
$fn$;

/**
 * Everything the client needs to render, changed since `p_since`.
 *
 * Fifty-three days of devotions is well under a megabyte, so this is deliberately
 * unsophisticated: no partial-sync engine, just the rows that changed. Passing null
 * pulls everything.
 */
create or replace function pull_content(p_since timestamptz default null)
  returns jsonb
  language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'server_time', now(),
    'today', ministry_today(),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(r))
      from rounds r
      where r.ministry_id = auth_ministry_id()
        and r.status <> 'draft'
        and (p_since is null or r.updated_at > p_since)), '[]'::jsonb),
    'books', coalesce((
      select jsonb_agg(to_jsonb(b))
      from books b
      where b.church_id = auth_church_id()
        and b.status in ('published', 'archived')
        and (p_since is null or b.updated_at > p_since)), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(to_jsonb(d))
      from devotion_days d
      where d.church_id = auth_church_id()
        and d.status = 'published'
        and d.scheduled_date is not null
        and d.scheduled_date <= ministry_today()
        and (p_since is null or d.updated_at > p_since)), '[]'::jsonb),
    'summary_questions', coalesce((
      select jsonb_agg(to_jsonb(q))
      from summary_questions q
      where q.church_id = auth_church_id()
        and exists (
          select 1 from devotion_days d
          where d.book_id = q.book_id and d.kind = 'summary'
            and d.status = 'published' and d.scheduled_date <= ministry_today())), '[]'::jsonb),
    'completions', coalesce((
      select jsonb_agg(to_jsonb(c))
      from day_completions c
      where c.user_id = auth.uid()), '[]'::jsonb),
    'reflections', coalesce((
      select jsonb_agg(to_jsonb(f))
      from reflections f
      where f.user_id = auth.uid()), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(to_jsonb(v))
      from favorites v
      where v.user_id = auth.uid()), '[]'::jsonb),
    'streak', (select to_jsonb(s) from streak_state s where s.user_id = auth.uid())
  )
$fn$;

revoke all on function plausible_live_claim(uuid, date, timestamptz) from public;
revoke all on function sync_outbox(jsonb) from public;
revoke all on function pull_content(timestamptz) from public;
grant execute on function sync_outbox(jsonb) to authenticated;
grant execute on function pull_content(timestamptz) to authenticated;
