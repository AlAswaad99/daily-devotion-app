-- Prayer sessions: synced, private, and deliberately not part of the streak.
--
-- The last of those is the one worth defending in a test. Prayer is tracked and
-- shown, never a condition of anything — a member who prays daily but reads
-- irregularly must not be handed a streak they have not kept, and it would be easy
-- for a later change to "reward" prayer without noticing what that changes.

begin;
select plan(12);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('d0000000-0000-4000-8000-000000000001', 'Pray', 'ጸሎት');
insert into ministries (id, church_id, name_en, name_am)
  values ('d0000000-0000-4000-8000-000000000002',
          'd0000000-0000-4000-8000-000000000001', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role) values
  ('d0000000-0000-4000-8000-00000000000a', 'prayer@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-00000000000b', 'nosy@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, role, reminder_at, joined_on)
values
  ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', 'Prayerful', 'user', '06:00', ministry_today()),
  ('d0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000001',
   'd0000000-0000-4000-8000-000000000002', 'Nosy', 'admin', '06:00', ministry_today());

/*
 * A real streak, not a written-in one.
 *
 * Every sync calls `refresh_streak_state`, which recomputes from completions — so a
 * `streak_state` row with no completions behind it is recalculated to zero, and a
 * test that asserted otherwise would be testing a fiction. Two consecutive days read
 * gives a streak of two that prayer must leave exactly alone.
 */
insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('d0000000-0000-4000-8000-000000000003',
          'd0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000002', '01', '01',
          ministry_today() - 1, 'published');

insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('d0000000-0000-4000-8000-000000000004',
          'd0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-000000000003', 1, 'P', 'Prayer', 'ጸሎት', 'published');

insert into devotion_days (id, church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
values ('d0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000004', 1, 'One', 'አንድ', 'published',
        ministry_today() - 1),
       ('d0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000004', 2, 'Two', 'ሁለት', 'published',
        ministry_today());

insert into day_completions (user_id, devotion_day_id, completed_at, counted_for_streak, method)
values ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000011',
        now() - interval '1 day', true, 'live'),
       ('d0000000-0000-4000-8000-00000000000a', 'd0000000-0000-4000-8000-000000000012',
        now(), true, 'live');

select refresh_streak_state('d0000000-0000-4000-8000-00000000000a');



set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

/*
 * The baseline is taken through an *empty* sync, not by reading the table directly.
 *
 * Every sync stamps `last_synced_at` and then refreshes the streak, and the streak
 * engine's answer depends on that stamp — so a figure read before any sync is not
 * comparable with one read after. Running the same path with nothing in it isolates
 * the one variable being tested: the prayer session.
 */
select sync_outbox('[]'::jsonb);

create temporary table streak_before as
  select current, best from streak_state
   where user_id = 'd0000000-0000-4000-8000-00000000000a';

-- ------------------------------------------------------------------ pushing one
select is(
  (select (sync_outbox(jsonb_build_array(jsonb_build_object(
     'client_id', 'd0000000-0000-4000-8000-0000000000c1', 'entity', 'prayer_session', 'op', 'upsert',
     'payload', jsonb_build_object(
       'id', 'd0000000-0000-4000-8000-0000000000f1',
       'started_at', (now() - interval '10 minutes')::text,
       'ended_at', now()::text,
       'duration_seconds', 600,
       'completed', true,
       'interruptions', 2))))) ->> 'applied')::int,
  1, 'a prayer session syncs through the outbox');

select is(
  (select duration_seconds from prayer_sessions
    where id = 'd0000000-0000-4000-8000-0000000000f1'),
  600, 'with its duration');

select is(
  (select interruptions from prayer_sessions
    where id = 'd0000000-0000-4000-8000-0000000000f1'),
  2, 'and its interruptions, which are recorded rather than hidden');

-- ---------------------------------------------------------- the streak is untouched
select is(
  (select current from streak_state where user_id = 'd0000000-0000-4000-8000-00000000000a'),
  (select current from streak_before),
  'praying leaves the streak exactly where reading left it');

select is(
  (select best from streak_state where user_id = 'd0000000-0000-4000-8000-00000000000a'),
  (select best from streak_before),
  'and leaves the best one alone too');

select is(
  (select count(*)::int from day_completions
    where user_id = 'd0000000-0000-4000-8000-00000000000a'),
  2, 'and does not count as having read a day');

-- ------------------------------------------------------------------- replaying it
/*
 * The client generates the id, so a flush that is replayed after a lost response
 * must correct the row rather than record the prayer twice.
 */
select is(
  (select (sync_outbox(jsonb_build_array(jsonb_build_object(
     'client_id', 'd0000000-0000-4000-8000-0000000000c2', 'entity', 'prayer_session', 'op', 'upsert',
     'payload', jsonb_build_object(
       'id', 'd0000000-0000-4000-8000-0000000000f1',
       'started_at', (now() - interval '10 minutes')::text,
       'ended_at', now()::text,
       'duration_seconds', 600,
       'completed', true,
       'interruptions', 2))))) ->> 'applied')::int,
  1, 'replaying the same session is accepted');

select is(
  (select count(*)::int from prayer_sessions
    where user_id = 'd0000000-0000-4000-8000-00000000000a'),
  1, 'but records one prayer, not two');

/*
 * A session pushed while still running, then pushed again once finished. The longer
 * duration has to win: the first push is a partial account of the same prayer.
 */
select sync_outbox(jsonb_build_array(jsonb_build_object(
  'client_id', 'd0000000-0000-4000-8000-0000000000c3', 'entity', 'prayer_session', 'op', 'upsert',
  'payload', jsonb_build_object(
    'id', 'd0000000-0000-4000-8000-0000000000f1',
    'started_at', (now() - interval '10 minutes')::text,
    'duration_seconds', 120,
    'completed', false,
    'interruptions', 0))));

select is(
  (select duration_seconds from prayer_sessions
    where id = 'd0000000-0000-4000-8000-0000000000f1'),
  600, 'a shorter replay cannot shorten a finished session');

select ok(
  (select completed from prayer_sessions
    where id = 'd0000000-0000-4000-8000-0000000000f1'),
  'nor un-complete it');

-- ------------------------------------------------------------------------ privacy
select is(
  (select sessions from prayer_summary(30))::int,
  1, 'the member sees their own summary');

/*
 * The other user is an *admin*, which is the case that matters: the dashboard counts
 * prayer in aggregate and must never be able to read whose.
 */
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select is(
  (select count(*)::int from prayer_sessions
    where user_id = 'd0000000-0000-4000-8000-00000000000a'),
  0, 'an admin cannot read another member''s prayer sessions');

select * from finish();
rollback;
