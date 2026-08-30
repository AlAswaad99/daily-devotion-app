-- Phase 4 exit criterion: future books are provably invisible.
--
-- "Provably" is the operative word. The spec states it as a decision three times —
-- the library shows current and past only, future books are not listed, not
-- browsable, not fetched — so it is tested at every door rather than trusted to the
-- screen that happens to render it.

begin;
select plan(10);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('ffffffff-1111-4111-8111-111111111111', 'Visibility', 'ታይነት');
insert into ministries (id, church_id, name_en, name_am)
  values ('ffffffff-2222-4222-8222-222222222222',
          'ffffffff-1111-4111-8111-111111111111', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role)
  values ('ffffffff-0000-4000-8000-000000000001', 'member@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
         ('ffffffff-0000-4000-8000-000000000002', 'admin@example.com',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, role, joined_on)
  values ('ffffffff-0000-4000-8000-000000000001',
          'ffffffff-1111-4111-8111-111111111111',
          'ffffffff-2222-4222-8222-222222222222', 'Member', 'user', ministry_today() - 5),
         ('ffffffff-0000-4000-8000-000000000002',
          'ffffffff-1111-4111-8111-111111111111',
          'ffffffff-2222-4222-8222-222222222222', 'Admin', 'admin', ministry_today() - 5);

insert into rounds (id, church_id, ministry_id, phase_code, round_code, starts_on, status)
  values ('ffffffff-3333-4333-8333-333333333333',
          'ffffffff-1111-4111-8111-111111111111',
          'ffffffff-2222-4222-8222-222222222222', '55', '01',
          ministry_today() - 5, 'published');

-- A book being read now, and a book whose days are all still ahead.
insert into books (id, church_id, round_id, sequence, source_id, title_en, title_am, status)
  values ('ffffffff-4444-4444-8444-44444444444a',
          'ffffffff-1111-4111-8111-111111111111',
          'ffffffff-3333-4333-8333-333333333333', 1, 'NOW', 'Current', 'አሁን', 'published'),
         ('ffffffff-4444-4444-8444-44444444444b',
          'ffffffff-1111-4111-8111-111111111111',
          'ffffffff-3333-4333-8333-333333333333', 2, 'NEXT', 'Future', 'ወደፊት', 'published'),
         -- And one the admin has not published at all.
         ('ffffffff-4444-4444-8444-44444444444c',
          'ffffffff-1111-4111-8111-111111111111',
          'ffffffff-3333-4333-8333-333333333333', 3, 'DRAFT', 'Draft', 'ረቂቅ', 'draft');

insert into devotion_days (id, church_id, book_id, day_number, topic_en, topic_am,
                           status, scheduled_date)
values
  ('ffffffff-5555-4555-8555-55555555550a', 'ffffffff-1111-4111-8111-111111111111',
   'ffffffff-4444-4444-8444-44444444444a', 1, 'yesterday', 'x', 'published',
   ministry_today() - 1),
  ('ffffffff-5555-4555-8555-55555555550b', 'ffffffff-1111-4111-8111-111111111111',
   'ffffffff-4444-4444-8444-44444444444a', 2, 'today', 'x', 'published', ministry_today()),
  -- Every day of the next book is in the future.
  ('ffffffff-5555-4555-8555-55555555550c', 'ffffffff-1111-4111-8111-111111111111',
   'ffffffff-4444-4444-8444-44444444444b', 1, 'tomorrow', 'x', 'published',
   ministry_today() + 1),
  ('ffffffff-5555-4555-8555-55555555550d', 'ffffffff-1111-4111-8111-111111111111',
   'ffffffff-4444-4444-8444-44444444444b', 2, 'next week', 'x', 'published',
   ministry_today() + 7),
  -- A published day inside an unpublished book.
  ('ffffffff-5555-4555-8555-55555555550e', 'ffffffff-1111-4111-8111-111111111111',
   'ffffffff-4444-4444-8444-44444444444c', 1, 'drafted', 'x', 'published',
   ministry_today() - 2);

insert into summary_questions (church_id, book_id, ordinal, question_en, question_am)
  values ('ffffffff-1111-4111-8111-111111111111',
          'ffffffff-4444-4444-8444-44444444444b', 1, 'A future question', 'x');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"ffffffff-0000-4000-8000-000000000001","role":"authenticated"}';

-- ------------------------------------------------------ door 1: direct table read
select is(
  (select count(*) from devotion_days where scheduled_date > ministry_today())::int,
  0, 'a member selecting the table directly sees no future day');

select is(
  (select count(*) from devotion_days)::int,
  2, 'only the two days that have actually arrived are visible');

-- ------------------------------------------------------ door 2: the sync payload
select is(
  jsonb_array_length(pull_content(null) -> 'days')::int,
  2, 'the sync payload carries no future day either');

select is(
  (select count(*) from jsonb_array_elements(pull_content(null) -> 'days') d
    where (d ->> 'scheduled_date')::date > ministry_today())::int,
  0, 'and nothing in it is dated ahead of today');

-- The library lists a book only if it has a visible day, so the future book is
-- absent from the listing without needing a rule of its own.
select is(
  (select count(*) from books b
    where exists (select 1 from devotion_days d where d.book_id = b.id))::int,
  1, 'the future book is not listed, because none of its days are visible');

-- ------------------------------------------------------ door 3: guessing an id
select is(
  (select count(*) from devotion_days
    where id = 'ffffffff-5555-4555-8555-55555555550c')::int,
  0, 'knowing a future day''s id does not help');

select throws_ok(
  $$select complete_day('ffffffff-5555-4555-8555-55555555550c')$$,
  '42501', null,
  'and it cannot be completed');

-- ------------------------------------------------------ door 4: unpublished books
select is(
  (select count(*) from books where status = 'draft')::int,
  0, 'an unpublished book is invisible even though its day has passed');

-- ------------------------------------------------------ summary questions
select is(
  (select count(*) from summary_questions)::int,
  0, 'a future book''s summary questions are invisible too');

-- ------------------------------------------------------ the admin still sees all
set local request.jwt.claims to
  '{"sub":"ffffffff-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*) from devotion_days)::int,
  5, 'an admin sees every day, including the future and the unpublished');

select * from finish();
rollback;
