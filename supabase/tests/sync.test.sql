-- Phase 3: offline sync.
--
-- The interesting case is that a genuinely offline week and a wound-back clock look
-- identical from the server's side. The only thing the server can prove is when the
-- device last reached it, and that is what these tests pin down.

begin;
select plan(12);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('eeeeeeee-1111-4111-8111-111111111111', 'Sync Church', 'ማመሳሰል');
insert into ministries (id, church_id, name_en, name_am)
  values ('eeeeeeee-2222-4222-8222-222222222222',
          'eeeeeeee-1111-4111-8111-111111111111', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role)
  values ('eeeeeeee-0000-4000-8000-000000000001', 'offline@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, joined_on)
  values ('eeeeeeee-0000-4000-8000-000000000001',
          'eeeeeeee-1111-4111-8111-111111111111',
          'eeeeeeee-2222-4222-8222-222222222222', 'Offline', ministry_today() - 20);
insert into streak_state (user_id) values ('eeeeeeee-0000-4000-8000-000000000001');

insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('eeeeeeee-3333-4333-8333-333333333333',
          'eeeeeeee-1111-4111-8111-111111111111',
          'eeeeeeee-2222-4222-8222-222222222222', '66', '01',
          ministry_today() - 20, 'published');

insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('eeeeeeee-4444-4444-8444-444444444444',
          'eeeeeeee-1111-4111-8111-111111111111',
          'eeeeeeee-3333-4333-8333-333333333333', 1, 'S', 'Sync', 'Sync', 'published');

-- A week of days, today back to today-6.
insert into devotion_days (church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
select 'eeeeeeee-1111-4111-8111-111111111111',
       'eeeeeeee-4444-4444-8444-444444444444',
       n + 1, 'day ' || n, 'x', 'published', ministry_today() - n
from generate_series(0, 6) as n;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"eeeeeeee-0000-4000-8000-000000000001","role":"authenticated"}';

-- ------------------------------------------------------- a genuinely offline week
-- No last_synced_at yet: the device has never reached the server, so a claim that
-- each day was read on its own date is plausible and must be honoured.
select is(
  (select (sync_outbox(jsonb_build_array(
     jsonb_build_object(
       'client_id', '11111111-0000-4000-8000-00000000000a',
       'entity', 'completion',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today() - 3),
         'client_completed_at', (ministry_today() - 3)::timestamptz + interval '7 hours')),
     jsonb_build_object(
       'client_id', '11111111-0000-4000-8000-00000000000b',
       'entity', 'completion',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today() - 2),
         'client_completed_at', (ministry_today() - 2)::timestamptz + interval '7 hours')),
     jsonb_build_object(
       'client_id', '11111111-0000-4000-8000-00000000000c',
       'entity', 'completion',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today() - 1),
         'client_completed_at', (ministry_today() - 1)::timestamptz + interval '7 hours'))
   )) -> 'streak' ->> 'current')::int),
  3, 'a week offline then reconnecting produces the streak the days were read on');

select is(
  (select count(*) from day_completions where method = 'live')::int,
  3, 'all three are recorded as live, not backfilled');

select isnt(
  (select last_synced_at from profiles where id = 'eeeeeeee-0000-4000-8000-000000000001'),
  null, 'the flush records that the device reached the server');

-- ------------------------------------------------------- at-least-once delivery
select is(
  (select (sync_outbox(jsonb_build_array(
     jsonb_build_object(
       'client_id', '11111111-0000-4000-8000-00000000000a',
       'entity', 'completion',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today() - 3),
         'client_completed_at', (ministry_today() - 3)::timestamptz + interval '7 hours'))
   )) ->> 'skipped')::int),
  1, 'a retried item is skipped rather than applied twice');

select is(
  (select count(*) from day_completions)::int,
  3, 'and no duplicate completion is created');

-- ------------------------------------------------------- the wound-back clock
-- The device has now provably been online (last_synced_at was just set). A claim
-- that a day *before* that contact was read on its own date cannot be true.
select is(
  (select (sync_outbox(jsonb_build_array(
     jsonb_build_object(
       'client_id', '11111111-0000-4000-8000-00000000000d',
       'entity', 'completion',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today() - 5),
         'client_completed_at', (ministry_today() - 5)::timestamptz + interval '7 hours'))
   )) -> 'streak' ->> 'current')::int),
  3, 'winding the clock back does not extend the streak');

select is(
  (select method::text from day_completions c
     join devotion_days d on d.id = c.devotion_day_id
    where d.scheduled_date = ministry_today() - 5),
  'backfill', 'the claim is downgraded to a backfill, not rejected');

-- The user still gets credit for having read it — they just do not get the streak.
select is(
  (select count(*) from day_completions)::int, 4, 'the reading is still recorded');

-- ------------------------------------------------------- nothing from the future
select is(
  (select plausible_live_claim('eeeeeeee-0000-4000-8000-000000000001',
                               ministry_today() + 1,
                               (ministry_today() + 1)::timestamptz)),
  false, 'a day in the future can never be claimed live');

-- ------------------------------------------------------- a mismatched timestamp
select is(
  (select plausible_live_claim('eeeeeeee-0000-4000-8000-000000000001',
                               ministry_today() - 1,
                               ministry_today()::timestamptz + interval '7 hours')),
  false, 'a timestamp that does not fall on the day it claims is not live');

-- ------------------------------------------------------- reflections, last write wins
select is(
  (select (sync_outbox(jsonb_build_array(
     jsonb_build_object(
       'client_id', '22222222-0000-4000-8000-00000000000a',
       'entity', 'reflection',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today()),
         'body', 'first',
         'updated_at', now() - interval '1 hour')),
     jsonb_build_object(
       'client_id', '22222222-0000-4000-8000-00000000000b',
       'entity', 'reflection',
       'payload', jsonb_build_object(
         'devotion_day_id', (select id from devotion_days where scheduled_date = ministry_today()),
         'body', 'second, written later on another device',
         'updated_at', now()))
   )) ->> 'applied')::int >= 2),
  true, 'a batch applies every item');

select is(
  (select body from reflections limit 1),
  'second, written later on another device',
  'the newer edit wins, compared on updated_at');

select * from finish();
rollback;
