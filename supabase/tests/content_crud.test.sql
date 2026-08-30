-- Phase 5: content CRUD, and what must never be deletable.
--
-- Deleting a day cascades to `day_completions`, which means deleting content
-- somebody has read would silently rewrite their streak. The rule — published or
-- read content can only be archived — is enforced by trigger rather than by the
-- dashboard, so these tests exercise the database directly. If they pass, no screen
-- or script can get around it either.

begin;
select plan(14);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('aaaaaaaa-9999-4999-8999-999999999999', 'CRUD', 'CRUD');
insert into ministries (id, church_id, name_en, name_am)
  values ('bbbbbbbb-9999-4999-8999-999999999999',
          'aaaaaaaa-9999-4999-8999-999999999999', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role)
  values ('cccccccc-9999-4999-8999-999999999999', 'crud@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into profiles (id, church_id, ministry_id, display_name, role, joined_on)
  values ('cccccccc-9999-4999-8999-999999999999',
          'aaaaaaaa-9999-4999-8999-999999999999',
          'bbbbbbbb-9999-4999-8999-999999999999', 'Admin', 'admin', ministry_today() - 30);
insert into streak_state (user_id) values ('cccccccc-9999-4999-8999-999999999999');

-- A *different* person does the reading. The guards count completions, and
-- `day_completions` is own-row-only under RLS, so a guard that cannot see across
-- users would wave the delete through — which is precisely the bug this fixture
-- exists to catch. Using the admin's own completion here proved nothing.
insert into auth.users (id, email, instance_id, aud, role)
  values ('cccccccc-8888-4888-8888-888888888888', 'reader@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
insert into profiles (id, church_id, ministry_id, display_name, role, joined_on)
  values ('cccccccc-8888-4888-8888-888888888888',
          'aaaaaaaa-9999-4999-8999-999999999999',
          'bbbbbbbb-9999-4999-8999-999999999999', 'Reader', 'user', ministry_today() - 30);
insert into streak_state (user_id) values ('cccccccc-8888-4888-8888-888888888888');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"cccccccc-9999-4999-8999-999999999999","role":"authenticated"}';

-- ------------------------------------------------------------------- create
select lives_ok(
  $$insert into phases (id, church_id, ministry_id, code, title_en, title_am)
    values ('dddddddd-9999-4999-8999-999999999999',
            'aaaaaaaa-9999-4999-8999-999999999999',
            'bbbbbbbb-9999-4999-8999-999999999999', '90', 'Foundations', 'መሠረቶች')$$,
  'an admin can create a phase');

select lives_ok(
  $$insert into rounds (id, church_id, ministry_id, phase_id, round_code, starts_on, status)
    values ('eeeeeeee-9999-4999-8999-999999999999',
            'aaaaaaaa-9999-4999-8999-999999999999',
            'bbbbbbbb-9999-4999-8999-999999999999',
            'dddddddd-9999-4999-8999-999999999999', '01', ministry_today(), 'draft')$$,
  'and a round inside it, without naming the code');

-- The round carries the code for display; the phase owns it.
select is(
  (select phase_code from rounds where id = 'eeeeeeee-9999-4999-8999-999999999999'),
  '90', 'the round picks up its phase code automatically');

-- ------------------------------------------------------------------- rename
select lives_ok(
  $$update phases set code = '91', title_en = 'Foundations II'
     where id = 'dddddddd-9999-4999-8999-999999999999'$$,
  'a phase can be renamed');

select is(
  (select phase_code from rounds where id = 'eeeeeeee-9999-4999-8999-999999999999'),
  '91', 'and the rename reaches its rounds');

-- ------------------------------------------------------- delete while unread
insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('ffffffff-9999-4999-8999-999999999999',
          'aaaaaaaa-9999-4999-8999-999999999999',
          'eeeeeeee-9999-4999-8999-999999999999', 1, 'B', 'Draft book', 'ረቂቅ', 'draft');

insert into devotion_days (id, church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
  values ('11111111-9999-4999-8999-999999999999',
          'aaaaaaaa-9999-4999-8999-999999999999',
          'ffffffff-9999-4999-8999-999999999999', 1, 'A day', 'ቀን',
          'published', ministry_today() - 1);

select lives_ok(
  $$delete from devotion_days where id = '11111111-9999-4999-8999-999999999999'$$,
  'a draft day nobody has read deletes freely');

-- ---------------------------------------------------------- delete once read
insert into devotion_days (id, church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
  values ('22222222-9999-4999-8999-999999999999',
          'aaaaaaaa-9999-4999-8999-999999999999',
          'ffffffff-9999-4999-8999-999999999999', 2, 'Read day', 'የተነበበ',
          'published', ministry_today() - 2);

-- Written as the reader, not the admin doing the deleting.
set local role postgres;
insert into day_completions (user_id, devotion_day_id, method, counted_for_streak)
  values ('cccccccc-8888-4888-8888-888888888888',
          '22222222-9999-4999-8999-999999999999', 'live', true);
set local role authenticated;

select throws_ok(
  $$delete from devotion_days where id = '22222222-9999-4999-8999-999999999999'$$,
  '23503', null,
  'a day somebody has read cannot be deleted');

-- The admin cannot even see this row, which is the point: the guard has to count
-- what the person deleting is not allowed to read.
select is(
  (select count(*) from day_completions
    where devotion_day_id = '22222222-9999-4999-8999-999999999999')::int,
  0, 'and the admin still cannot read the completion that blocked them');

select throws_ok(
  $$delete from books where id = 'ffffffff-9999-4999-8999-999999999999'$$,
  '23503', null,
  'nor can the book containing it, even as a draft');

-- ------------------------------------------------------------ published book
update books set status = 'published' where id = 'ffffffff-9999-4999-8999-999999999999';

select throws_ok(
  $$delete from books where id = 'ffffffff-9999-4999-8999-999999999999'$$,
  '23503', null,
  'a published book cannot be deleted');

select lives_ok(
  $$update books set status = 'archived' where id = 'ffffffff-9999-4999-8999-999999999999'$$,
  'but it can be archived');

-- Archived means "no longer current", not "gone": the app still reads it.
select is(
  (select count(*) from books where id = 'ffffffff-9999-4999-8999-999999999999')::int,
  1, 'and an archived book is still visible to its readers');

select throws_ok(
  $$delete from rounds where id = 'eeeeeeee-9999-4999-8999-999999999999'$$,
  '23503', null,
  'a round holding archived content cannot be deleted');

select throws_ok(
  $$delete from phases where id = 'dddddddd-9999-4999-8999-999999999999'$$,
  '23503', null,
  'and a phase that still holds a round cannot be deleted');

select * from finish();
rollback;
