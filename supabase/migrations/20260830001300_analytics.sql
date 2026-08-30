-- Abide — Phase 5. Dashboard analytics.
--
-- Every progress table is own-row-only under RLS, so an admin cannot count
-- completions by querying them — which is the privacy design working, not an
-- obstacle to route around. Each function below is SECURITY DEFINER, admin-gated,
-- and returns counts. None of them has a column capable of carrying a reflection
-- body, a reflection id, or the identity of who wrote one.

/**
 * Where people stop within a book.
 *
 * The spec singles this out as the metric that will actually change content
 * decisions: if half the ministry falls away at day 9 of Psalms, that is a fact
 * about day 9.
 */
create or replace function ministry_dropoff()
  returns table (
    book_id uuid,
    book_title_en text,
    day_number int,
    kind day_kind,
    topic_en text,
    scheduled_date date,
    readers bigint
  )
  language sql stable security definer set search_path = public
as $fn$
  select b.id, b.title_en, d.day_number, d.kind, d.topic_en, d.scheduled_date,
         count(distinct c.user_id) as readers
  from books b
  join devotion_days d on d.book_id = b.id
  left join day_completions c on c.devotion_day_id = d.id
  where auth_is_admin()
    and b.church_id = auth_church_id()
    and d.scheduled_date is not null
    and d.scheduled_date <= ministry_today()
  group by b.id, b.title_en, b.sequence, d.day_number, d.kind, d.topic_en, d.scheduled_date
  order by b.sequence, d.day_number
$fn$;

/** How current streaks are distributed. Buckets, not people. */
create or replace function ministry_streaks()
  returns table (bucket text, members bigint)
  language sql stable security definer set search_path = public
as $fn$
  select bucket, count(*) as members
  from (
    select case
             when s.current = 0 then 'none'
             when s.current between 1 and 3 then '1-3'
             when s.current between 4 and 7 then '4-7'
             when s.current between 8 and 14 then '8-14'
             when s.current between 15 and 30 then '15-30'
             else '30+'
           end as bucket
    from streak_state s
    join profiles p on p.id = s.user_id
    where auth_is_admin() and p.ministry_id = auth_ministry_id()
  ) buckets
  group by bucket
$fn$;

/** Joins over time and the language split. */
create or replace function ministry_membership()
  returns table (joined_on date, joined bigint, amharic bigint, english bigint)
  language sql stable security definer set search_path = public
as $fn$
  select p.joined_on,
         count(*) as joined,
         count(*) filter (where p.ui_language = 'am') as amharic,
         count(*) filter (where p.ui_language = 'en') as english
  from profiles p
  where auth_is_admin() and p.ministry_id = auth_ministry_id()
  group by p.joined_on
  order by p.joined_on
$fn$;

/**
 * What needs an admin's attention, as numbers.
 *
 * `runway_days` is the one that matters most: when the last scheduled day passes,
 * every reader hits "coming soon" on the same morning.
 */
create or replace function content_health()
  returns table (
    incomplete_days bigint,
    awaiting_review bigint,
    draft_books bigint,
    unscheduled_days bigint,
    last_scheduled date,
    runway_days int,
    members bigint,
    reference_problems bigint
  )
  language sql stable security definer set search_path = public
as $fn$
  select
    -- A summary day legitimately has no purpose; its content is the questions.
    (select count(*) from devotion_days d
      where d.church_id = auth_church_id()
        and (trim(d.topic_en) = '' or trim(d.topic_am) = ''
             or (d.kind = 'devotion'
                 and (trim(d.purpose_en) = '' or trim(d.purpose_am) = '')))),
    (select count(*) from books b
      where b.church_id = auth_church_id() and b.status = 'in_review'),
    (select count(*) from books b
      where b.church_id = auth_church_id() and b.status = 'draft'),
    (select count(*) from devotion_days d
      join books b on b.id = d.book_id
      where d.church_id = auth_church_id()
        and b.status in ('published', 'in_review')
        and d.scheduled_date is null),
    (select max(d.scheduled_date) from devotion_days d
      join books b on b.id = d.book_id
      where d.church_id = auth_church_id() and b.status = 'published'),
    (select coalesce(max(d.scheduled_date) - ministry_today(), 0)::int from devotion_days d
      join books b on b.id = d.book_id
      where d.church_id = auth_church_id() and b.status = 'published'),
    (select count(*) from profiles p where p.ministry_id = auth_ministry_id()),
    -- A day whose written reference text produced no parsed reference at all.
    (select count(*) from devotion_days d
      where d.church_id = auth_church_id()
        and d.kind = 'devotion'
        and trim(d.cross_refs_raw) <> ''
        and jsonb_array_length(d.cross_refs) = 0)
  where auth_is_admin()
$fn$;

revoke all on function ministry_dropoff() from public;
revoke all on function ministry_streaks() from public;
revoke all on function ministry_membership() from public;
revoke all on function content_health() from public;
grant execute on function ministry_dropoff() to authenticated;
grant execute on function ministry_streaks() to authenticated;
grant execute on function ministry_membership() to authenticated;
grant execute on function content_health() to authenticated;
