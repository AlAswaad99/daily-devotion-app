-- Abide — Phase 8. Prayer sessions, synced like everything else.
--
-- The table and its own-row policy have existed since Phase 0; what was missing is
-- the path from a phone to it. A prayer session is written offline like a completion
-- or a reflection, queued in the outbox, and flushed when there is a network.
--
-- One thing it deliberately does *not* do: touch the streak. Prayer is tracked and
-- shown, never a condition of it. Praying is not a task to be scored, and a member
-- who prays daily but reads irregularly should not be told they have a streak they
-- have not kept.

/**
 * Sessions belonging to the caller, for the pull.
 *
 * The client generates the id, so a re-sent session is recognised rather than
 * duplicated — the same at-least-once contract the rest of the outbox relies on.
 */
create or replace function pull_prayer_sessions(p_since timestamptz default null)
  returns setof prayer_sessions
  language sql stable security definer set search_path = public as $fn$
  select *
  from prayer_sessions
  where user_id = auth.uid()
    and (p_since is null or started_at > p_since)
  order by started_at desc
  limit 200
$fn$;

revoke all on function pull_prayer_sessions(timestamptz) from public;
grant execute on function pull_prayer_sessions(timestamptz) to authenticated;

/*
 * The outbox gains a `prayer_session` entity.
 *
 * Taken verbatim from the definition in 20260830000900_reflections.sql with one
 * branch added, rather than retyped. Retyping it lost
 * `update profiles set last_synced_at` and the `refresh_streak_state` call — and the
 * offline clock-tamper detection depends on the first of those entirely.
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
      v_day := (v_item -> 'payload' ->> 'devotion_day_id')::uuid;

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
        v_rejected := v_rejected || jsonb_build_object(
          'client_id', v_client_id, 'reason', 'day_not_available');
        continue;
      end if;

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
        set reading_seconds = greatest(c.reading_seconds,
              coalesce((v_item -> 'payload' ->> 'reading_seconds')::int, 0)),
            scroll_depth = greatest(c.scroll_depth,
              least(greatest(coalesce((v_item -> 'payload' ->> 'scroll_depth')::real, 0), 0), 1));

      v_applied := v_applied + 1;

    elsif v_entity = 'reflection' then
      -- Last write wins on updated_at, per question.
      insert into reflections as r (
        user_id, devotion_day_id, question_ordinal, client_id, body, created_at, updated_at)
      values (
        v_user,
        (v_item -> 'payload' ->> 'devotion_day_id')::uuid,
        coalesce((v_item -> 'payload' ->> 'question_ordinal')::int, 0),
        v_client_id,
        v_item -> 'payload' ->> 'body',
        coalesce((v_item -> 'payload' ->> 'updated_at')::timestamptz, now()),
        coalesce((v_item -> 'payload' ->> 'updated_at')::timestamptz, now()))
      on conflict (user_id, devotion_day_id, question_ordinal) do update
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

    elsif v_entity = 'prayer_session' then
      /*
       * The client's own id is the primary key, which is what makes a replayed
       * flush a no-op rather than a duplicate session.
       *
       * `do update` rather than `do nothing`: a session can be pushed while still
       * running — the phone died mid-prayer and the row flushed on the next launch —
       * and the finished version has to be able to correct it. Taking the greater
       * duration means a stale partial push can never shorten a finished prayer.
       */
      insert into prayer_sessions as p (
        id, user_id, started_at, ended_at, duration_seconds, completed, interruptions)
      values (
        coalesce((v_item -> 'payload' ->> 'id')::uuid, gen_random_uuid()),
        v_user,
        coalesce((v_item -> 'payload' ->> 'started_at')::timestamptz, now()),
        (v_item -> 'payload' ->> 'ended_at')::timestamptz,
        greatest(coalesce((v_item -> 'payload' ->> 'duration_seconds')::int, 0), 0),
        coalesce((v_item -> 'payload' ->> 'completed')::boolean, false),
        greatest(coalesce((v_item -> 'payload' ->> 'interruptions')::int, 0), 0))
      on conflict (id) do update
        set ended_at = coalesce(excluded.ended_at, p.ended_at),
            duration_seconds = greatest(p.duration_seconds, excluded.duration_seconds),
            completed = p.completed or excluded.completed,
            interruptions = greatest(p.interruptions, excluded.interruptions)
        where p.user_id = v_user;
      v_applied := v_applied + 1;

    else
      v_rejected := v_rejected || jsonb_build_object(
        'client_id', v_client_id, 'reason', 'unknown_entity');
    end if;
  end loop;

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
 * What prayer has looked like lately, for the member's own screen.
 *
 * Own-row only, like the table. There is no admin view of this and there should not
 * be one: the dashboard counts prayer sessions in aggregate and never sees whose.
 */
create or replace function prayer_summary(p_days int default 30)
  returns table (sessions bigint, minutes bigint, interruptions bigint, completed bigint)
  language sql stable security definer set search_path = public as $fn$
  select count(*),
         coalesce(sum(duration_seconds), 0) / 60,
         coalesce(sum(interruptions), 0),
         count(*) filter (where completed)
  from prayer_sessions
  where user_id = auth.uid()
    and started_at >= now() - make_interval(days => p_days)
$fn$;

revoke all on function prayer_summary(int) from public;
grant execute on function prayer_summary(int) to authenticated;
