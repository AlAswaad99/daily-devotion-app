-- Abide — Phase 4. Reflections per question.
--
-- A devotion has one reflection. A summary day has three or four questions and each
-- gets its own field, so the key has to include which question is being answered.
-- Ordinal 0 means "the day itself", which is what every devotion day uses.

alter table reflections
  add column question_ordinal int not null default 0;

alter table reflections
  drop constraint reflections_user_id_devotion_day_id_key;

alter table reflections
  add constraint reflections_user_day_question_key
  unique (user_id, devotion_day_id, question_ordinal);

-- Favourites and reflections are both read on the library screen, filtered by the
-- day they belong to.
create index if not exists reflections_user_idx on reflections (user_id, updated_at desc);
create index if not exists favorites_user_idx on favorites (user_id);

/**
 * Reflection sync has to key on the question as well as the day, or answering
 * question 2 would overwrite question 1.
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

-- No new pull function is needed for the library: `pull_content` already syncs
-- every published day scheduled on or before today, which is exactly the set the
-- library shows. The client reads it locally.
