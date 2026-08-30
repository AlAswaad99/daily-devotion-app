-- Abide — Phase 2. The streak engine, server side.
--
-- The client computes optimistically so the ✓ is instant, but this is the answer
-- that wins. `recompute_streak` mirrors `computeStreak` in packages/domain exactly;
-- a parity test runs both over the same fixtures and fails if they diverge.
--
-- Never trust the client for streak state: completions arrive with a client
-- timestamp, and it is checked against the EAT day boundary here. A device with a
-- wrong clock cannot manufacture a streak.

-- The days that count for a user: scheduled, published, visible, and on or after
-- the day they joined. Pre-join days are readable but outside streak math entirely.
create or replace function streak_days(p_user uuid)
  returns table (id uuid, scheduled_date date)
  language sql stable security definer set search_path = public
as $fn$
  select d.id, d.scheduled_date
  from devotion_days d
  join profiles p on p.id = p_user
  where p_user = auth.uid()
    and d.church_id = p.church_id
    and d.status = 'published'
    and d.scheduled_date is not null
    and d.scheduled_date >= p.joined_on
    and d.scheduled_date <= ministry_today()
  order by d.scheduled_date
$fn$;

/**
 * Recompute the streak from day_completions. `streak_state` is a cache that can be
 * dropped and rebuilt; this is the source of truth.
 */
create or replace function recompute_streak(p_user uuid)
  returns table (current int, best int, last_counted_date date, missed_dates date[])
  language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_day        record;
  v_counted    boolean;
  v_run        int := 0;
  v_best       int := 0;
  v_last       date;
  v_missed     date[] := '{}';
  v_today      date := ministry_today();
  v_today_id   uuid;
  v_today_done boolean := false;
  v_current    int := 0;
begin
  -- SECURITY DEFINER: without this, any authenticated user could read anyone
  -- else's streak by passing their id.
  if p_user <> auth.uid() then
    raise exception 'can only recompute your own streak' using errcode = '42501';
  end if;

  for v_day in select * from streak_days(p_user) loop
    -- Only 'live' and 'repair' count; backfilling marks the day read without
    -- restoring the streak.
    select exists (
      select 1 from day_completions c
      where c.user_id = p_user and c.devotion_day_id = v_day.id and c.method <> 'backfill'
    ) into v_counted;

    if v_counted then
      v_run := v_run + 1;
      if v_run > v_best then v_best := v_run; end if;
      v_last := v_day.scheduled_date;
    else
      v_run := 0;
      -- Today is still open: not yet completed is not the same as missed.
      if v_day.scheduled_date < v_today then
        v_missed := v_missed || v_day.scheduled_date;
      end if;
    end if;

    if v_day.scheduled_date = v_today then
      v_today_id := v_day.id;
      v_today_done := v_counted;
    end if;
  end loop;

  -- Walk backwards for the current run, skipping an open today, and stop at the
  -- first day that does not count.
  for v_day in select * from streak_days(p_user) order by scheduled_date desc loop
    if v_day.scheduled_date = v_today and not v_today_done then
      continue;
    end if;

    select exists (
      select 1 from day_completions c
      where c.user_id = p_user and c.devotion_day_id = v_day.id and c.method <> 'backfill'
    ) into v_counted;

    exit when not v_counted;
    v_current := v_current + 1;
  end loop;

  return query select v_current, v_best, v_last, v_missed;
end;
$fn$;

/** Refresh the cache from the ledger. Safe to call as often as you like. */
create or replace function refresh_streak_state(p_user uuid)
  returns streak_state
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_calc record;
  v_row  streak_state;
begin
  select * into v_calc from recompute_streak(p_user);

  insert into streak_state as s (user_id, current, best, last_counted_date, updated_at)
  values (p_user, v_calc.current, v_calc.best, v_calc.last_counted_date, now())
  on conflict (user_id) do update
    set current = excluded.current,
        -- `best` never goes down, even if a completion is removed.
        best = greatest(s.best, excluded.best),
        last_counted_date = excluded.last_counted_date,
        updated_at = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

/**
 * Complete a day. The method is decided here, not by the caller: a day completed on
 * its own scheduled date is 'live', any earlier day is 'backfill'. Repair is a
 * separate, explicit action.
 */
create or replace function complete_day(
  p_day             uuid,
  p_reading_seconds int default 0,
  p_scroll_depth    real default 0,
  p_confirmed_early boolean default false
) returns streak_state
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_date    date;
  v_today   date := ministry_today();
  v_method  completion_method;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- streak_days is the whole visibility rule in one place: this user's church,
  -- published, scheduled, not in the future, and not before they joined. A day
  -- missing from it is a day they may not complete, whatever the reason.
  select s.scheduled_date into v_date from streak_days(v_user) s where s.id = p_day;
  if v_date is null then
    raise exception 'that day is not available to this user' using errcode = '42501';
  end if;

  v_method := case when v_date = v_today then 'live' else 'backfill' end;

  insert into day_completions as c (
    user_id, devotion_day_id, completed_at, counted_for_streak, method,
    reading_seconds, scroll_depth, confirmed_early)
  values (
    v_user, p_day, now(), v_method = 'live', v_method,
    greatest(p_reading_seconds, 0), least(greatest(p_scroll_depth, 0), 1), p_confirmed_early)
  on conflict (user_id, devotion_day_id) do update
    -- Re-reading a day already done never downgrades it: a repaired day stays
    -- repaired, and reading time accumulates.
    set reading_seconds = c.reading_seconds + greatest(p_reading_seconds, 0),
        scroll_depth = greatest(c.scroll_depth, least(greatest(p_scroll_depth, 0), 1));

  if v_method = 'live' then
    insert into streak_events (user_id, kind, scheduled_date, meta)
    values (v_user, 'extended', v_date, jsonb_build_object('source', 'complete_day'));
  end if;

  return refresh_streak_state(v_user);
end;
$fn$;

/**
 * Repair a missed day. The rules themselves live in packages/domain — this function
 * enforces only what the database can prove: that the day was really missed, is
 * really in range, and that a credit rule really has a credit to spend.
 */
create or replace function repair_day(p_day uuid, p_rule text)
  returns streak_state
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_user     uuid := auth.uid();
  v_date     date;
  v_today    date := ministry_today();
  v_age      int;
  v_credits  int;
  v_today_ok boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select s.scheduled_date into v_date from streak_days(v_user) s where s.id = p_day;
  if v_date is null then
    raise exception 'that day is not available to this user' using errcode = '42501';
  end if;

  if exists (
    select 1 from day_completions
    where user_id = v_user and devotion_day_id = p_day and method <> 'backfill'
  ) then
    raise exception 'that day already counts' using errcode = '22023';
  end if;

  v_age := v_today - v_date;
  if v_age < 1 then
    raise exception 'only a past day can be repaired' using errcode = '22023';
  end if;

  if p_rule = 'double_up' then
    select exists (
      select 1 from day_completions c
      join devotion_days d on d.id = c.devotion_day_id
      where c.user_id = v_user and d.scheduled_date = v_today and c.method <> 'backfill'
    ) into v_today_ok;
    if not v_today_ok then
      raise exception 'double_up requires today to be complete' using errcode = '22023';
    end if;
    if v_age > 2 then
      raise exception 'double_up expires after 48 hours' using errcode = '22023';
    end if;

  elsif p_rule = 'monthly_credit' then
    select repair_credits into v_credits from streak_state where user_id = v_user;
    if coalesce(v_credits, 0) < 1 then
      raise exception 'no repair credits left this month' using errcode = '22023';
    end if;
    if v_age > 7 then
      raise exception 'monthly_credit reaches back 7 days' using errcode = '22023';
    end if;
    update streak_state set repair_credits = repair_credits - 1 where user_id = v_user;

  else
    raise exception 'unknown repair rule: %', p_rule using errcode = '22023';
  end if;

  insert into day_completions as c (
    user_id, devotion_day_id, completed_at, counted_for_streak, method)
  values (v_user, p_day, now(), true, 'repair')
  on conflict (user_id, devotion_day_id) do update
    set method = 'repair', counted_for_streak = true;

  insert into streak_events (user_id, kind, scheduled_date, meta)
  values (v_user, 'repaired', v_date, jsonb_build_object('rule', p_rule));

  return refresh_streak_state(v_user);
end;
$fn$;

revoke all on function streak_days(uuid) from public;
revoke all on function recompute_streak(uuid) from public;
revoke all on function refresh_streak_state(uuid) from public;
revoke all on function complete_day(uuid, int, real, boolean) from public;
revoke all on function repair_day(uuid, text) from public;

-- These read another user's rows only when asked for the caller's own id, and the
-- write functions derive the user from auth.uid() rather than a parameter.
grant execute on function streak_days(uuid) to authenticated;
grant execute on function recompute_streak(uuid) to authenticated;
grant execute on function complete_day(uuid, int, real, boolean) to authenticated;
grant execute on function repair_day(uuid, text) to authenticated;
