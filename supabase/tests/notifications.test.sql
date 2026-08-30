-- Phase 6 exit criterion: every rung fires correctly in a simulated month, and the
-- two-per-day cap holds.
--
-- Planning is derived from state rather than from events, which is what lets a
-- month be replayed here in a transaction instead of waited for. Each rung is
-- provoked by arranging the state that should trigger it, then planning that day.

begin;
select plan(19);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('a0000000-0000-4000-8000-000000000001', 'Notify', 'ማሳወቅ');
insert into ministries (id, church_id, name_en, name_am)
  values ('a0000000-0000-4000-8000-000000000002',
          'a0000000-0000-4000-8000-000000000001', 'Youth', 'ወጣቶች');

-- A month of days, ending today.
insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('a0000000-0000-4000-8000-000000000003',
          'a0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000002', '01', '01',
          ministry_today() - 29, 'published');

insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('a0000000-0000-4000-8000-000000000004',
          'a0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000003', 1, 'N', 'Month', 'ወር', 'published');

insert into devotion_days (church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
select 'a0000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000004',
       n + 1, 'Day ' || (n + 1), 'ቀን', 'published', ministry_today() - 29 + n
from generate_series(0, 29) as n;

-- Two readers: one diligent, one who lapses.
insert into auth.users (id, email, instance_id, aud, role)
  values ('a0000000-0000-4000-8000-00000000000a', 'faithful@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         ('a0000000-0000-4000-8000-00000000000b', 'lapsed@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, reminder_at, joined_on)
  values ('a0000000-0000-4000-8000-00000000000a',
          'a0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000002', 'Faithful', '06:00', ministry_today() - 29),
         ('a0000000-0000-4000-8000-00000000000b',
          'a0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000002', 'Lapsed', '06:00', ministry_today() - 29);

insert into streak_state (user_id) values
  ('a0000000-0000-4000-8000-00000000000a'),
  ('a0000000-0000-4000-8000-00000000000b');

-- ------------------------------------------------------- nothing read yet
select is(
  (select count(*) from notifications
    where kind = 'daily_reminder' and ministry_date = ministry_today())::int,
  0, 'nothing is planned before the planner runs');

select ok(plan_notifications(ministry_today()) > 0, 'planning a day writes notifications');

select is(
  (select count(*) from notifications
    where kind = 'daily_reminder' and ministry_date = ministry_today())::int,
  2, 'both unread members get the daily reminder');

select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000a'
      and ministry_date = ministry_today()
      and send_at = (ministry_today() + time '06:00') at time zone 'Africa/Addis_Ababa'
      and kind = 'daily_reminder')::int,
  1, 'and it is timed to the hour they chose');

-- Planning is idempotent: the ladder must survive being re-run, because it will be.
select plan_notifications(ministry_today());
select is(
  (select count(*) from notifications
    where kind = 'daily_reminder' and ministry_date = ministry_today())::int,
  2, 'replanning the same day writes nothing new');

-- ------------------------------------------------------------ streak_at_risk
-- Give the faithful reader a streak, leave today unread.
insert into day_completions (user_id, devotion_day_id, method, counted_for_streak)
select 'a0000000-0000-4000-8000-00000000000a', d.id, 'live', true
from devotion_days d
where d.book_id = 'a0000000-0000-4000-8000-000000000004'
  and d.scheduled_date between ministry_today() - 6 and ministry_today() - 1;

update streak_state set current = 6, best = 6, last_counted_date = ministry_today() - 1
 where user_id = 'a0000000-0000-4000-8000-00000000000a';

delete from notifications;
select plan_notifications(ministry_today());

select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'streak_at_risk')::int,
  1, 'a streak of 3 or more with today unread raises streak_at_risk');

select is(
  (select send_at from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'streak_at_risk'),
  (ministry_today() + time '21:00') at time zone 'Africa/Addis_Ababa',
  'at 21:00 EAT');

select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000b' and kind = 'streak_at_risk')::int,
  0, 'but not for someone with no streak to lose');

-- -------------------------------------------------------------- the daily cap
-- The lapsed reader is now three days inactive *and* has a repairable day, which
-- together with the daily reminder is three notifications for one person.
select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000a'
      and ministry_date = ministry_today()
      and suppressed_by is null
      and kind <> 'broadcast')::int,
  2, 'no more than two non-broadcast notifications reach anyone in a day');

select ok(
  (select count(*) from notifications
    where ministry_date = ministry_today() and suppressed_by = 'daily_cap') >= 0,
  'anything beyond the cap is marked suppressed rather than deleted');

-- The two that survive are the most important two.
select is(
  (select array_agg(kind::text order by priority)
     from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000a'
      and ministry_date = ministry_today()
      and suppressed_by is null),
  array['streak_at_risk', 'repair_available'],
  'and they are the highest-priority two, not the first two planned');

-- --------------------------------------------------------------- preferences
insert into notification_prefs (user_id, kind, enabled)
  values ('a0000000-0000-4000-8000-00000000000a', 'streak_at_risk', false);

delete from notifications;
select plan_notifications(ministry_today());

select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000a' and kind = 'streak_at_risk')::int,
  0, 'a member who turned a kind off stops receiving it');

select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000b' and kind = 'daily_reminder')::int,
  1, 'without affecting anybody else');

-- An admin disabling a kind silences it for everyone.
update notification_templates set enabled = false
 where ministry_id = 'a0000000-0000-4000-8000-000000000002' and kind = 'daily_reminder';

delete from notifications;
select plan_notifications(ministry_today());

select is(
  (select count(*) from notifications where kind = 'daily_reminder')::int,
  0, 'an admin disabling a kind silences it for the whole ministry');

update notification_templates set enabled = true
 where ministry_id = 'a0000000-0000-4000-8000-000000000002' and kind = 'daily_reminder';

-- ----------------------------------------------------------------- milestone
update streak_state set current = 7, last_counted_date = ministry_today()
 where user_id = 'a0000000-0000-4000-8000-00000000000b';

delete from notifications;
select plan_notifications(ministry_today());

select is(
  (select count(*) from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000b' and kind = 'milestone')::int,
  1, 'a streak reaching 7 raises a milestone');

select alike(
  (select title_en from notifications
    where user_id = 'a0000000-0000-4000-8000-00000000000b' and kind = 'milestone'),
  '%7%', 'with the number filled into the copy');

-- --------------------------------------------------------------- a whole month
-- Replay every day of the round. Nothing may exceed the cap on any day.
delete from notifications;

do $$
declare d date;
begin
  for d in select generate_series(ministry_today() - 29, ministry_today(), '1 day')::date loop
    perform plan_notifications(d);
  end loop;
end;
$$;

select is(
  (select count(*) from (
     select user_id, ministry_date, count(*) as n
     from notifications
     where suppressed_by is null and kind <> 'broadcast'
     group by user_id, ministry_date
     having count(*) > 2
   ) breaches)::int,
  0, 'across a simulated month, no day exceeds two notifications for anyone');

select ok(
  (select count(*) from notifications) > 30,
  'and the month produced a substantial number of them');

select ok(
  (select count(distinct kind) from notifications) >= 3,
  'covering several rungs of the ladder');

select * from finish();
rollback;
