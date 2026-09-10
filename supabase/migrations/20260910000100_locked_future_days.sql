-- Future days become a locked preview instead of staying entirely invisible.
--
-- Phase 4 made "future books are provably invisible" an exit criterion, tested
-- at four doors in supabase/tests/visibility.test.sql — not fetched, not
-- listed, not readable by id, nothing about them leaked anywhere. That rule is
-- being relaxed on purpose, not overridden by accident: a member should be
-- able to see the shape of the round ahead of them (day number, date, topic)
-- without being able to read a day's actual content before it arrives.
--
-- The RLS policy on devotion_days is untouched — a member still cannot select
-- a future row directly, guess its id, or read anything through it. Only
-- `pull_content` (security definer, already the sole path content reaches a
-- device through) now also emits future days, in a reduced shape: id,
-- book_id, day_number, kind, topic, scheduled_date, updated_at, and
-- `locked: true`. purpose/prayer/passage/key_verses/cross_refs/
-- expected_seconds are the actual devotional content, and stay withheld until
-- the day's own date arrives — at which point a later pull_content call
-- (case branch below) sends the real row and the client's local copy is
-- overwritten in place.
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
      select jsonb_agg(
        case
          when d.scheduled_date <= ministry_today() then to_jsonb(d)
          else jsonb_build_object(
            'id', d.id,
            'book_id', d.book_id,
            'day_number', d.day_number,
            'kind', d.kind,
            'topic_en', d.topic_en,
            'topic_am', d.topic_am,
            'scheduled_date', d.scheduled_date,
            'updated_at', d.updated_at,
            'locked', true
          )
        end
      )
      from devotion_days d
      join books b on b.id = d.book_id
      where d.church_id = auth_church_id()
        and d.status = 'published'
        and b.status in ('published', 'archived')
        and d.scheduled_date is not null
        and (p_since is null or d.updated_at > p_since)), '[]'::jsonb),
    -- Summary questions stay exactly as invisible as before a future book's
    -- closing prompts are not "the shape of the round", they are content.
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
