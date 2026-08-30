-- Phase 2: the streak RPCs.
--
-- The parity test in packages/domain proves the two engines agree on the *maths*.
-- This proves the write path enforces what only the server can: which day you are
-- allowed to complete, what method that completion gets, and that a repair rule
-- cannot be talked into repairing something it should not.

begin;
select plan(16);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('cccccccc-1111-4111-8111-111111111111', 'Streak Church', 'ፈተና');
insert into ministries (id, church_id, name_en, name_am)
  values ('cccccccc-2222-4222-8222-222222222222',
          'cccccccc-1111-4111-8111-111111111111', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role)
  values ('cccccccc-0000-4000-8000-000000000001', 'streaker@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, joined_on)
  values ('cccccccc-0000-4000-8000-000000000001',
          'cccccccc-1111-4111-8111-111111111111',
          'cccccccc-2222-4222-8222-222222222222', 'Streaker',
          ministry_today() - 10);
insert into streak_state (user_id, repair_credits)
  values ('cccccccc-0000-4000-8000-000000000001', 1);

insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('cccccccc-3333-4333-8333-333333333333',
          'cccccccc-1111-4111-8111-111111111111',
          'cccccccc-2222-4222-8222-222222222222', '77', '01',
          ministry_today() - 10, 'published');

insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('cccccccc-4444-4444-8444-444444444444',
          'cccccccc-1111-4111-8111-111111111111',
          'cccccccc-3333-4333-8333-333333333333', 1, 'S', 'Streak', 'Streak', 'published');

-- Days at today-3 .. today, plus one in the future and one before the user joined.
insert into devotion_days (id, church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
values
  ('dddddddd-0000-4000-8000-00000000000a', 'cccccccc-1111-4111-8111-111111111111',
   'cccccccc-4444-4444-8444-444444444444', 1, 'minus3', 'x', 'published', ministry_today() - 3),
  ('dddddddd-0000-4000-8000-00000000000b', 'cccccccc-1111-4111-8111-111111111111',
   'cccccccc-4444-4444-8444-444444444444', 2, 'minus2', 'x', 'published', ministry_today() - 2),
  ('dddddddd-0000-4000-8000-00000000000c', 'cccccccc-1111-4111-8111-111111111111',
   'cccccccc-4444-4444-8444-444444444444', 3, 'minus1', 'x', 'published', ministry_today() - 1),
  ('dddddddd-0000-4000-8000-00000000000d', 'cccccccc-1111-4111-8111-111111111111',
   'cccccccc-4444-4444-8444-444444444444', 4, 'today',  'x', 'published', ministry_today()),
  ('dddddddd-0000-4000-8000-00000000000e', 'cccccccc-1111-4111-8111-111111111111',
   'cccccccc-4444-4444-8444-444444444444', 5, 'future', 'x', 'published', ministry_today() + 1),
  ('dddddddd-0000-4000-8000-00000000000f', 'cccccccc-1111-4111-8111-111111111111',
   'cccccccc-4444-4444-8444-444444444444', 6, 'prejoin','x', 'published', ministry_today() - 30);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"cccccccc-0000-4000-8000-000000000001","role":"authenticated"}';

-- ------------------------------------------------------------ completing today
select is(
  (select current from complete_day('dddddddd-0000-4000-8000-00000000000d', 120, 1.0))::int,
  1, 'completing today starts a streak of 1');

select is(
  (select method::text from day_completions
     where devotion_day_id = 'dddddddd-0000-4000-8000-00000000000d'),
  'live', 'a day completed on its own date is live');

select is(
  (select counted_for_streak from day_completions
     where devotion_day_id = 'dddddddd-0000-4000-8000-00000000000d'),
  true, 'and it counts');

-- ------------------------------------------------------------ backfilling
select is(
  (select current from complete_day('dddddddd-0000-4000-8000-00000000000b'))::int,
  1, 'backfilling a missed day does not extend the streak');

select is(
  (select method::text from day_completions
     where devotion_day_id = 'dddddddd-0000-4000-8000-00000000000b'),
  'backfill', 'the method is decided by the server, not the caller');

select is(
  (select counted_for_streak from day_completions
     where devotion_day_id = 'dddddddd-0000-4000-8000-00000000000b'),
  false, 'a backfilled day never counts');

-- The client cannot pass a method, so there is no way to ask for 'live' on a past
-- day. The column constraint is the second line of defence.
select throws_ok(
  $$insert into day_completions (user_id, devotion_day_id, method, counted_for_streak)
    values ('cccccccc-0000-4000-8000-000000000001',
            'dddddddd-0000-4000-8000-00000000000a', 'backfill', true)$$,
  '23514', null,
  'a backfill that claims to count is rejected by the check constraint');

-- ------------------------------------------------------------ visibility
select throws_ok(
  $$select complete_day('dddddddd-0000-4000-8000-00000000000e')$$,
  '42501', null,
  'a future day cannot be completed');

-- Pre-join days are readable but outside streak math, so they are simply not in
-- the completable set — the same refusal a future day gets.
select throws_ok(
  $$select complete_day('dddddddd-0000-4000-8000-00000000000f')$$,
  '42501', null,
  'a pre-join day cannot be completed');

-- ------------------------------------------------------------ repair: double_up
select throws_ok(
  $$select repair_day('dddddddd-0000-4000-8000-00000000000a', 'double_up')$$,
  '22023', null,
  'double_up will not reach back more than 48 hours');

select is(
  (select current from repair_day('dddddddd-0000-4000-8000-00000000000c', 'double_up'))::int,
  2, 'repairing yesterday with today done restores the link');

select is(
  (select method::text from day_completions
     where devotion_day_id = 'dddddddd-0000-4000-8000-00000000000c'),
  'repair', 'the repaired day is marked as repaired, not live');

select throws_ok(
  $$select repair_day('dddddddd-0000-4000-8000-00000000000c', 'double_up')$$,
  '22023', null,
  'a day that already counts cannot be repaired again');

-- ------------------------------------------------------------ repair: credits
select is(
  (select repair_credits from repair_day('dddddddd-0000-4000-8000-00000000000a',
                                         'monthly_credit'))::int,
  0, 'monthly_credit spends the credit');

select throws_ok(
  $$select repair_day('dddddddd-0000-4000-8000-00000000000b', 'monthly_credit')$$,
  '22023', null,
  'and there is not a second one this month');

select throws_ok(
  $$select repair_day('dddddddd-0000-4000-8000-00000000000b', 'free_streak_please')$$,
  '22023', null,
  'an unknown rule is refused rather than silently allowed');

select * from finish();
rollback;
