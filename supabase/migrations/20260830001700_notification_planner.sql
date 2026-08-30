-- Abide — Phase 6. The planner.
--
-- Given a ministry date, decide what should reach whom. Everything is derived from
-- state rather than from events, so the same function can plan today or replay any
-- day of a simulated month and get the same answer.
--
-- Delivery is deliberately not here. This writes down the decision; a job reads the
-- rows and talks to FCM. That separation is what makes the ladder testable without
-- a push credential.

/**
 * The days a user has missed and could still repair, as of a date.
 *
 * Mirrors the rules in packages/domain: `double_up` needs today complete and a miss
 * within 48 hours; `monthly_credit` needs an unspent credit and a miss within seven
 * days.
 */
create or replace function repairable_dates(p_user uuid, p_date date)
  returns table (missed_date date, rule text)
  language sql stable security definer set search_path = public as $fn$
  with visible as (
    select d.id, d.scheduled_date
    from devotion_days d
    join books b on b.id = d.book_id
    join profiles p on p.id = p_user
    where d.church_id = p.church_id
      and d.status = 'published'
      and b.status in ('published', 'archived')
      and d.scheduled_date is not null
      and d.scheduled_date >= p.joined_on
      and d.scheduled_date <= p_date
  ),
  missed as (
    select v.scheduled_date
    from visible v
    where not exists (
      select 1 from day_completions c
      where c.user_id = p_user and c.devotion_day_id = v.id and c.method <> 'backfill'
    )
      and v.scheduled_date < p_date
  ),
  today_done as (
    select exists (
      select 1 from visible v
      join day_completions c on c.devotion_day_id = v.id
      where v.scheduled_date = p_date and c.user_id = p_user and c.method <> 'backfill'
    ) as done
  ),
  credits as (
    select coalesce((select repair_credits from streak_state where user_id = p_user), 0) as n
  )
  select m.scheduled_date, 'double_up'
    from missed m, today_done t
   where t.done and p_date - m.scheduled_date between 1 and 2
  union
  select m.scheduled_date, 'monthly_credit'
    from missed m, credits c
   where c.n >= 1 and p_date - m.scheduled_date between 1 and 7
$fn$;

/**
 * Plan one ministry date.
 *
 * Returns how many notifications were written. Idempotent: the dedupe key is one
 * per user, kind and date, so replanning a day cannot double-send.
 */
create or replace function plan_notifications(p_date date)
  returns int
  language plpgsql security definer set search_path = public as $fn$
declare
  v_written int := 0;
  v_user record;
  v_copy record;
  v_seed int;
  v_meta jsonb;
begin
  for v_user in
    select p.id, p.ministry_id, p.church_id, p.reminder_at, p.timezone, p.joined_on,
           coalesce(s.current, 0) as streak,
           s.last_counted_date,
           coalesce(s.repair_credits, 0) as credits
    from profiles p
    left join streak_state s on s.user_id = p.id
    where p.joined_on <= p_date
  loop
    -- A stable seed per user and day: variants rotate, but replanning the same day
    -- picks the same one.
    v_seed := abs(hashtext(v_user.id::text || p_date::text));

    declare
      v_today_id uuid;
      v_today_done boolean := false;
      v_scheduled_today boolean := false;
      v_last_read date;
      v_inactive int;
    begin
      select d.id into v_today_id
      from devotion_days d
      join books b on b.id = d.book_id
      where d.church_id = v_user.church_id
        and d.status = 'published'
        and b.status in ('published', 'archived')
        and d.scheduled_date = p_date;

      v_scheduled_today := v_today_id is not null;

      if v_scheduled_today then
        select exists (
          select 1 from day_completions c
          where c.user_id = v_user.id and c.devotion_day_id = v_today_id
        ) into v_today_done;
      end if;

      select max(d.scheduled_date) into v_last_read
      from day_completions c
      join devotion_days d on d.id = c.devotion_day_id
      where c.user_id = v_user.id;

      v_inactive := case when v_last_read is null
                         then p_date - v_user.joined_on
                         else p_date - v_last_read end;

      -- ---------------------------------------------------------- daily_reminder
      -- At the time they chose, only if there is something to read and they have
      -- not read it.
      if v_scheduled_today and not v_today_done
         and notification_enabled(v_user.id, v_user.ministry_id, 'daily_reminder') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'daily_reminder', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key)
          values (
            v_user.id, 'daily_reminder', notification_priority('daily_reminder'), p_date,
            (p_date + v_user.reminder_at) at time zone 'Africa/Addis_Ababa',
            v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
            'daily_reminder:' || p_date)
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;

      -- ---------------------------------------------------------- streak_at_risk
      -- 21:00, a streak worth protecting, and today still unread.
      if v_scheduled_today and not v_today_done and v_user.streak >= 3
         and notification_enabled(v_user.id, v_user.ministry_id, 'streak_at_risk') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'streak_at_risk', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key, meta)
          values (
            v_user.id, 'streak_at_risk', notification_priority('streak_at_risk'), p_date,
            (p_date + time '21:00') at time zone 'Africa/Addis_Ababa',
            v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
            'streak_at_risk:' || p_date,
            jsonb_build_object('streak', v_user.streak))
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;

      -- ------------------------------------------------------------- streak_lost
      -- The morning after: yesterday was scheduled, was missed, and a streak ended.
      if exists (
        select 1 from devotion_days d
        join books b on b.id = d.book_id
        where d.church_id = v_user.church_id and d.status = 'published'
          and b.status in ('published', 'archived')
          and d.scheduled_date = p_date - 1
          and d.scheduled_date >= v_user.joined_on
          and not exists (
            select 1 from day_completions c
            where c.user_id = v_user.id and c.devotion_day_id = d.id and c.method <> 'backfill')
      ) and v_user.last_counted_date = p_date - 2
        and notification_enabled(v_user.id, v_user.ministry_id, 'streak_lost') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'streak_lost', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key)
          values (
            v_user.id, 'streak_lost', notification_priority('streak_lost'), p_date,
            (p_date + v_user.reminder_at) at time zone 'Africa/Addis_Ababa',
            v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
            'streak_lost:' || p_date)
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;

      -- -------------------------------------------------------- repair_available
      if exists (select 1 from repairable_dates(v_user.id, p_date))
         and notification_enabled(v_user.id, v_user.ministry_id, 'repair_available') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'repair_available', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key, meta)
          values (
            v_user.id, 'repair_available', notification_priority('repair_available'), p_date,
            (p_date + time '19:00') at time zone 'Africa/Addis_Ababa',
            v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
            'repair_available:' || p_date,
            (select jsonb_agg(jsonb_build_object('date', missed_date, 'rule', rule))
               from repairable_dates(v_user.id, p_date)))
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;

      -- ---------------------------------------------------------------- comeback
      if v_inactive in (3, 7, 14) then
        declare
          v_kind notification_kind := ('comeback_d' || v_inactive)::notification_kind;
        begin
          if notification_enabled(v_user.id, v_user.ministry_id, v_kind) then
            for v_copy in select * from pick_template(v_user.ministry_id, v_kind, v_seed) loop
              insert into notifications (
                user_id, kind, priority, ministry_date, send_at,
                title_en, title_am, body_en, body_am, variant, dedupe_key, meta)
              values (
                v_user.id, v_kind, notification_priority(v_kind), p_date,
                (p_date + v_user.reminder_at) at time zone 'Africa/Addis_Ababa',
                v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
                v_kind::text || ':' || p_date,
                jsonb_build_object('days_inactive', v_inactive))
              on conflict (user_id, dedupe_key) do nothing;
              v_written := v_written + 1;
            end loop;
          end if;
        end;
      end if;

      -- --------------------------------------------------------------- milestone
      if v_user.last_counted_date = p_date
         and v_user.streak in (7, 14, 30, 50, 100)
         and notification_enabled(v_user.id, v_user.ministry_id, 'milestone') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'milestone', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key, meta)
          values (
            v_user.id, 'milestone', notification_priority('milestone'), p_date,
            (p_date + time '20:00') at time zone 'Africa/Addis_Ababa',
            replace(v_copy.title_en, '{streak}', v_user.streak::text),
            replace(v_copy.title_am, '{streak}', v_user.streak::text),
            replace(v_copy.body_en, '{streak}', v_user.streak::text),
            replace(v_copy.body_am, '{streak}', v_user.streak::text),
            v_copy.variant,
            'milestone:' || v_user.streak,
            jsonb_build_object('streak', v_user.streak))
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;

      -- ----------------------------------------------------------- book_complete
      if v_scheduled_today and v_today_done and exists (
        select 1 from devotion_days d
        where d.id = v_today_id
          and d.day_number = (select max(day_number) from devotion_days where book_id = d.book_id)
      ) and notification_enabled(v_user.id, v_user.ministry_id, 'book_complete') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'book_complete', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key)
          values (
            v_user.id, 'book_complete', notification_priority('book_complete'), p_date,
            (p_date + time '20:30') at time zone 'Africa/Addis_Ababa',
            v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
            'book_complete:' || p_date)
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;

      -- -------------------------------------------------------------- round_start
      if exists (
        select 1 from rounds r
        where r.ministry_id = v_user.ministry_id
          and r.status = 'published'
          and r.starts_on = p_date
      ) and notification_enabled(v_user.id, v_user.ministry_id, 'round_start') then
        for v_copy in select * from pick_template(v_user.ministry_id, 'round_start', v_seed) loop
          insert into notifications (
            user_id, kind, priority, ministry_date, send_at,
            title_en, title_am, body_en, body_am, variant, dedupe_key)
          values (
            v_user.id, 'round_start', notification_priority('round_start'), p_date,
            (p_date + time '08:00') at time zone 'Africa/Addis_Ababa',
            v_copy.title_en, v_copy.title_am, v_copy.body_en, v_copy.body_am, v_copy.variant,
            'round_start:' || p_date)
          on conflict (user_id, dedupe_key) do nothing;
          v_written := v_written + 1;
        end loop;
      end if;
    end;
  end loop;

  perform apply_notification_cap(p_date);
  return v_written;
end;
$fn$;

/**
 * At most two non-broadcast notifications per person per day.
 *
 * This is the guardrail that makes the full ladder safe to turn on. Anything beyond
 * the top two by priority is marked suppressed rather than deleted, so it is
 * possible to see what the ladder wanted to send and what the cap stopped.
 */
create or replace function apply_notification_cap(p_date date)
  returns int
  language sql security definer set search_path = public as $fn$
  with ranked as (
    select id,
           row_number() over (
             partition by user_id
             order by priority, kind
           ) as rank
    from notifications
    where ministry_date = p_date
      and kind <> 'broadcast'
      and sent_at is null
  ),
  capped as (
    update notifications n
       set suppressed_by = 'daily_cap'
      from ranked r
     where n.id = r.id and r.rank > 2 and n.suppressed_by is null
    returning n.id
  )
  select count(*)::int from capped
$fn$;

revoke all on function plan_notifications(date) from public;
revoke all on function apply_notification_cap(date) from public;
revoke all on function repairable_dates(uuid, date) from public;
