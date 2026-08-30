-- Broadcasts: scheduled, targeted, and personalised.
--
-- The behaviour worth defending here is that a scheduled broadcast is resolved when
-- it *lands*, not when it was written. Everything else — sentence dropping, mute,
-- cancellation — follows from nothing being fanned out until dispatch.

begin;
select plan(21);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('b0000000-0000-4000-8000-000000000001', 'Cast', 'ስርጭት');
insert into ministries (id, church_id, name_en, name_am)
  values ('b0000000-0000-4000-8000-000000000002',
          'b0000000-0000-4000-8000-000000000001', 'Youth', 'ወጣቶች');

insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('b0000000-0000-4000-8000-000000000003',
          'b0000000-0000-4000-8000-000000000001',
          'b0000000-0000-4000-8000-000000000002', '01', '01',
          ministry_today() - 9, 'published');

insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('b0000000-0000-4000-8000-000000000004',
          'b0000000-0000-4000-8000-000000000001',
          'b0000000-0000-4000-8000-000000000003', 1, 'B', 'Romans', 'ሮሜ', 'published');

insert into devotion_days (church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
select 'b0000000-0000-4000-8000-000000000001',
       'b0000000-0000-4000-8000-000000000004',
       n + 1, 'Day ' || (n + 1), 'ቀን', 'published', ministry_today() - 9 + n
from generate_series(0, 9) as n;

/*
 * An admin, a member with a streak, a member with none, and one who has muted
 * broadcasts. The muted and streakless members are the interesting ones: they are
 * how "reached" and "matched" come apart.
 */
insert into auth.users (id, email, instance_id, aud, role) values
  ('b0000000-0000-4000-8000-00000000000a', 'lead@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-00000000000b', 'streaky@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-00000000000c', 'fresh@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-00000000000d', 'quiet@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, role, reminder_at,
                      joined_on, ui_language)
values
  ('b0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002', 'Lead', 'admin', '06:00', ministry_today() - 9, 'en'),
  ('b0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002', 'Streaky', 'user', '06:00', ministry_today() - 9, 'en'),
  ('b0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002', 'Fresh', 'user', '06:00', ministry_today() - 9, 'en'),
  ('b0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000001',
   'b0000000-0000-4000-8000-000000000002', 'Quiet', 'user', '06:00', ministry_today() - 9, 'am');

insert into streak_state (user_id, current) values
  ('b0000000-0000-4000-8000-00000000000a', 0),
  ('b0000000-0000-4000-8000-00000000000b', 6),
  ('b0000000-0000-4000-8000-00000000000c', 0),
  ('b0000000-0000-4000-8000-00000000000d', 0);

insert into notification_prefs (user_id, kind, enabled)
  values ('b0000000-0000-4000-8000-00000000000d', 'broadcast', false);

-- Everything below counts only this fixture's members.
create temporary view ours as
  select * from notifications
   where user_id::text like 'b0000000-0000-4000-8000-00000000000%';

-- ------------------------------------------------------------------ the renderer
select is(
  render_notification_copy('Hello {name}. You are on a {streak} day streak. See you.',
                           '{"name":"Sara","streak":"6"}'::jsonb),
  'Hello Sara. You are on a 6 day streak. See you.',
  'every variable present renders the whole message');

select is(
  render_notification_copy('Hello {name}. You are on a {streak} day streak. See you.',
                           '{"name":"Sara"}'::jsonb),
  'Hello Sara. See you.',
  'a sentence whose variable has no value is dropped, the rest survives');

select is(
  render_notification_copy('You are on a {streak} day streak.', '{}'::jsonb),
  null,
  'a message that is entirely unresolvable renders as nothing at all');

select is(
  render_notification_copy('ሰላም {name}። {streak} ቀናት ሆኖሃል። እንገናኝ።',
                           '{"name":"ዳኒ"}'::jsonb),
  'ሰላም ዳኒ። እንገናኝ።',
  'sentences are split on the Ethiopic full stop, not only the Latin one');

select is(
  render_notification_copy('No variables here.', '{}'::jsonb),
  'No variables here.',
  'copy without variables is untouched');

-- ----------------------------------------------------------------- the variables
select is(
  notification_variables('b0000000-0000-4000-8000-00000000000b', 'en') ->> 'streak',
  '6', 'a member with a streak has one');

select ok(
  notification_variables('b0000000-0000-4000-8000-00000000000c', 'en') -> 'streak' is null,
  'a member with no streak has no streak variable, rather than a zero');

select is(
  notification_variables('b0000000-0000-4000-8000-00000000000c', 'en') ->> 'name',
  'Fresh', 'the name variable is the display name');

-- A member with no name at all still gets greeted.
update profiles set display_name = '' where id = 'b0000000-0000-4000-8000-00000000000c';
select is(
  notification_variables('b0000000-0000-4000-8000-00000000000c', 'en') ->> 'name',
  'friend', 'a member with no display name falls back rather than being skipped');
select is(
  notification_variables('b0000000-0000-4000-8000-00000000000c', 'am') ->> 'name',
  'ወዳጄ', 'and the fallback is in their own language');
update profiles set display_name = 'Fresh' where id = 'b0000000-0000-4000-8000-00000000000c';

-- ------------------------------------------------------- scheduling and dispatch
insert into broadcasts (id, ministry_id, title_en, title_am, body_en, body_am,
                        status, created_by, target, scheduled_at)
values ('b0000000-0000-4000-8000-0000000000f1',
        'b0000000-0000-4000-8000-000000000002',
        'Youth night', 'የወጣቶች ምሽት',
        'Hello {name}. You are on a {streak} day streak. Friday at six.',
        'ሰላም {name}። {streak} ቀናት ሆኖሃል። አርብ ስድስት ሰዓት።',
        'scheduled', 'b0000000-0000-4000-8000-00000000000a',
        '{"streak_at_least": 5}'::jsonb,
        now() + interval '2 hours');

select is((select count(*) from ours)::int, 0,
  'a scheduled broadcast writes nothing until it is due');

select is(dispatch_broadcasts(), 0,
  'and the dispatcher passes over it while it is still in the future');

/*
 * The point of the whole design: bring it due, and meanwhile let someone else reach
 * the streak the broadcast targets. They must be included, because the audience is
 * resolved now rather than when the message was written.
 */
update broadcasts set scheduled_at = now() - interval '1 minute'
 where id = 'b0000000-0000-4000-8000-0000000000f1';
update streak_state set current = 5 where user_id = 'b0000000-0000-4000-8000-00000000000c';

select is(dispatch_broadcasts(), 2,
  'at send time the audience is resolved fresh, so a newly qualifying member is included');

select is(
  (select body_en from ours where user_id = 'b0000000-0000-4000-8000-00000000000b'),
  'Hello Streaky. You are on a 6 day streak. Friday at six.',
  'each member gets their own name and their own streak');

select is(
  (select body_en from ours where user_id = 'b0000000-0000-4000-8000-00000000000c'),
  'Hello Fresh. You are on a 5 day streak. Friday at six.',
  'including the one who only just qualified');

select is(
  (select status from broadcasts where id = 'b0000000-0000-4000-8000-0000000000f1'),
  'sent', 'a dispatched broadcast is marked sent');

select is(dispatch_broadcasts(), 0,
  'dispatching twice does not send anything twice');

-- ------------------------------------------------------------------- who is left out
delete from notifications where user_id::text like 'b0000000-0000-4000-8000-00000000000%';

insert into broadcasts (id, ministry_id, title_en, title_am, body_en, body_am,
                        status, created_by, target)
values ('b0000000-0000-4000-8000-0000000000f2',
        'b0000000-0000-4000-8000-000000000002',
        'Everyone', 'ሁሉም',
        'You are on a {streak} day streak.', '{streak} ቀናት ሆኖሃል።',
        'scheduled', 'b0000000-0000-4000-8000-00000000000a', '{}'::jsonb);

select is(dispatch_broadcast('b0000000-0000-4000-8000-0000000000f2'), 2,
  'a member whose every sentence depends on a value they lack is skipped, not sent an empty message');

select ok(
  not exists (select 1 from ours where user_id = 'b0000000-0000-4000-8000-00000000000d'),
  'and a member who muted broadcasts is never reached by one');

-- --------------------------------------------------------------------- cancelling
insert into broadcasts (id, ministry_id, title_en, title_am, body_en, body_am,
                        status, created_by, target, scheduled_at)
values ('b0000000-0000-4000-8000-0000000000f3',
        'b0000000-0000-4000-8000-000000000002',
        'Called off', 'ተሰርዟል', 'Never mind.', 'ተወው።',
        'scheduled', 'b0000000-0000-4000-8000-00000000000a', '{}'::jsonb,
        now() - interval '1 minute');

update broadcasts set status = 'cancelled'
 where id = 'b0000000-0000-4000-8000-0000000000f3';

select is(dispatch_broadcasts(), 0,
  'a cancelled broadcast is never dispatched, which is only possible because nothing was fanned out early');

-- ---------------------------------------------------------------------- authority
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select throws_ok(
  $$ select send_broadcast('b0000000-0000-4000-8000-0000000000f3') $$,
  '42501', null,
  'a member cannot send a broadcast');

select * from finish();
rollback;
