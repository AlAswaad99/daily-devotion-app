-- Abide — Phase 4. A day is only as visible as the book it belongs to.
--
-- The original policy checked the day's own status and date but said nothing about
-- its parent. A day marked published inside a book still in draft was therefore
-- readable — the book was correctly hidden, its contents were not. The library
-- listing happened to hide it (it lists books, and that book was invisible), but
-- any flat or filtered view reads days directly and would have shown it.
--
-- Found by supabase/tests/visibility.test.sql.

drop policy devotion_days_read on devotion_days;

create policy devotion_days_read on devotion_days for select to authenticated
  using (
    church_id = auth_church_id()
    and (
      auth_is_admin()
      or (
        status = 'published'
        and scheduled_date is not null
        and scheduled_date <= ministry_today()
        -- The parent has to be published as well. Without this, publishing a single
        -- day inside a draft book leaks it.
        and exists (
          select 1 from books b
          where b.id = devotion_days.book_id
            and b.status in ('published', 'archived')
        )
      )
    )
  );

-- streak_days is SECURITY DEFINER, so it bypasses the policy above and needs the
-- same rule stated again. A day nobody may read is a day nobody may complete.
create or replace function streak_days(p_user uuid)
  returns table (id uuid, scheduled_date date)
  language sql stable security definer set search_path = public
as $fn$
  select d.id, d.scheduled_date
  from devotion_days d
  join profiles p on p.id = p_user
  join books b on b.id = d.book_id
  where p_user = auth.uid()
    and d.church_id = p.church_id
    and d.status = 'published'
    and b.status in ('published', 'archived')
    and d.scheduled_date is not null
    and d.scheduled_date >= p.joined_on
    and d.scheduled_date <= ministry_today()
  order by d.scheduled_date
$fn$;

-- pull_content is SECURITY DEFINER too, and syncs days straight to the device.
create or replace function pull_content(p_since timestamptz default null)
  returns jsonb
  language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'server_time', now(),
    'today', ministry_today(),
    'rounds', coalesce((
      select jsonb_agg(to_jsonb(r))
      from rounds r
      where r.ministry_id = auth_ministry_id()
        and r.status <> 'draft'
        and (p_since is null or r.updated_at > p_since)), '[]'::jsonb),
    'books', coalesce((
      select jsonb_agg(to_jsonb(b))
      from books b
      where b.church_id = auth_church_id()
        and b.status in ('published', 'archived')
        and (p_since is null or b.updated_at > p_since)), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(to_jsonb(d))
      from devotion_days d
      join books b on b.id = d.book_id
      where d.church_id = auth_church_id()
        and d.status = 'published'
        and b.status in ('published', 'archived')
        and d.scheduled_date is not null
        and d.scheduled_date <= ministry_today()
        and (p_since is null or d.updated_at > p_since)), '[]'::jsonb),
    'summary_questions', coalesce((
      select jsonb_agg(to_jsonb(q))
      from summary_questions q
      where q.church_id = auth_church_id()
        and exists (
          select 1 from devotion_days d
          join books b on b.id = d.book_id
          where d.book_id = q.book_id and d.kind = 'summary'
            and d.status = 'published' and b.status in ('published', 'archived')
            and d.scheduled_date <= ministry_today())), '[]'::jsonb),
    'completions', coalesce((
      select jsonb_agg(to_jsonb(c))
      from day_completions c
      where c.user_id = auth.uid()), '[]'::jsonb),
    'reflections', coalesce((
      select jsonb_agg(to_jsonb(f))
      from reflections f
      where f.user_id = auth.uid()), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(to_jsonb(v))
      from favorites v
      where v.user_id = auth.uid()), '[]'::jsonb),
    'streak', (select to_jsonb(s) from streak_state s where s.user_id = auth.uid())
  )
$fn$;
