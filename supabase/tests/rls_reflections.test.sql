-- Phase 0 exit criterion: an admin cannot read another member's reflection.
-- This is the privacy promise the spec makes, tested at the database rather than
-- trusted to the UI. If someone ever adds an admin bypass policy to `reflections`,
-- this file goes red.

begin;
select plan(9);

-- --------------------------------------------------------------- fixtures
set local role postgres;

insert into churches (id, name_en, name_am)
  values ('dddddddd-1111-4111-8111-111111111111', 'Test Church', 'የሙከራ ቤተክርስቲያን');
insert into ministries (id, church_id, name_en, name_am)
  values ('dddddddd-2222-4222-8222-222222222222',
          'dddddddd-1111-4111-8111-111111111111', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'member@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         ('aaaaaaaa-0000-0000-0000-000000000002', 'admin@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, role, joined_on)
  values ('aaaaaaaa-0000-0000-0000-000000000001',
          'dddddddd-1111-4111-8111-111111111111',
          'dddddddd-2222-4222-8222-222222222222', 'Member', 'user',  current_date - 30),
         ('aaaaaaaa-0000-0000-0000-000000000002',
          'dddddddd-1111-4111-8111-111111111111',
          'dddddddd-2222-4222-8222-222222222222', 'Admin',  'admin', current_date - 30);

insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('dddddddd-3333-4333-8333-333333333333',
          'dddddddd-1111-4111-8111-111111111111',
          'dddddddd-2222-4222-8222-222222222222', '03', '01', current_date - 10, 'published');

insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('dddddddd-4444-4444-8444-444444444444',
          'dddddddd-1111-4111-8111-111111111111',
          'dddddddd-3333-4333-8333-333333333333', 1, 'BOOK 01', 'Ruth', 'ሩት', 'published');

-- One day already past, one scheduled in the future. The future one must be invisible.
insert into devotion_days (id, church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
  values ('dddddddd-5555-4555-8555-555555555555',
          'dddddddd-1111-4111-8111-111111111111',
          'dddddddd-4444-4444-8444-444444444444', 1, 'Decision', 'ውሳኔ',
          'published', current_date - 1),
         ('dddddddd-6666-4666-8666-666666666666',
          'dddddddd-1111-4111-8111-111111111111',
          'dddddddd-4444-4444-8444-444444444444', 2, 'Loyalty', 'ታማኝነት',
          'published', current_date + 7);

insert into reflections (user_id, devotion_day_id, body)
  values ('aaaaaaaa-0000-0000-0000-000000000001',
          'dddddddd-5555-4555-8555-555555555555', 'something private');

-- --------------------------------------------------------------- as the author
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from reflections)::int, 1,
  'the author reads their own reflection');

select lives_ok(
  $$update reflections set body = 'edited'
      where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'the author can edit their own reflection');

select is(
  (select count(*) from devotion_days)::int, 1,
  'a member sees only days scheduled on or before today — future books are invisible');

select throws_ok(
  $$insert into devotion_days (church_id, book_id, day_number, topic_en, topic_am)
    values ('dddddddd-1111-4111-8111-111111111111',
            'dddddddd-4444-4444-8444-444444444444', 99, 'x', 'x')$$,
  '42501', null,
  'a member cannot write content');

-- --------------------------------------------------------------- as the admin
set local request.jwt.claims to
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from reflections)::int, 0,
  'THE RULE: an admin cannot read another member''s reflection');

select is(
  (select count(*) from reflections
     where user_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int, 0,
  'naming the user explicitly does not help either');

-- An UPDATE that matches no visible row is not an error, so assert on rows affected.
with attempted as (
  update reflections set body = 'admin was here'
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select is((select count(*) from attempted)::int, 0,
  'an admin cannot overwrite a reflection either');

select is(
  (select count(*) from devotion_days)::int, 2,
  'an admin does see unpublished and future days');

-- The aggregate path admins are supposed to use: numbers, never text.
select is(
  (select completions from ministry_engagement(current_date - 7, current_date)
     where scheduled_date = current_date - 1)::int, 0,
  'the aggregate function reports engagement counts without exposing bodies');

select * from finish();
rollback;
