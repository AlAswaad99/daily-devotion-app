-- Abide — Phase 5. Make the delete guards actually able to see.
--
-- The guards added with the phases table counted completions to decide whether a
-- delete was safe. Trigger functions run as the invoking user, and
-- `day_completions` is own-row-only under RLS — so when an *admin* deleted a day,
-- the guard could not see anybody else's completions, counted zero, and allowed it.
--
-- The protection therefore worked only when the person deleting was the same person
-- who had read it, which is the one case that does not matter. It has to be
-- SECURITY DEFINER to count rows it is not allowed to read.
--
-- Found by exercising the delete over the API as an admin against a member's
-- reading history; the pgTAP test missed it because both roles were the same user.

create or replace function block_unsafe_day_delete() returns trigger
  language plpgsql security definer set search_path = public as $fn$
declare
  v_readers int;
begin
  select count(*) into v_readers from day_completions where devotion_day_id = old.id;
  if v_readers > 0 then
    raise exception
      'That day has been read by % member(s). Archive it instead — deleting it would remove it from their history.',
      v_readers
      using errcode = '23503';
  end if;
  return old;
end;
$fn$;

create or replace function block_unsafe_book_delete() returns trigger
  language plpgsql security definer set search_path = public as $fn$
declare
  v_readers int;
begin
  if old.status in ('published', 'archived') then
    raise exception
      'This book is %. Published content can only be archived, so nobody loses what they have already read.',
      old.status
      using errcode = '23503';
  end if;

  select count(*) into v_readers
  from day_completions c
  join devotion_days d on d.id = c.devotion_day_id
  where d.book_id = old.id;

  if v_readers > 0 then
    raise exception
      'Days in this book have been read % time(s). Archive it instead.', v_readers
      using errcode = '23503';
  end if;

  return old;
end;
$fn$;

create or replace function block_unsafe_round_delete() returns trigger
  language plpgsql security definer set search_path = public as $fn$
declare
  v_live int;
  v_readers int;
begin
  if old.status in ('published', 'archived') then
    raise exception
      'This round is %. Archive it instead of deleting it.', old.status
      using errcode = '23503';
  end if;

  select count(*) into v_live from books
   where round_id = old.id and status in ('published', 'archived');
  if v_live > 0 then
    raise exception
      'This round still contains % published book(s). Archive them first.', v_live
      using errcode = '23503';
  end if;

  -- A draft round whose days have nonetheless been read: possible if a book was
  -- published, read, then moved back to draft.
  select count(*) into v_readers
  from day_completions c
  join devotion_days d on d.id = c.devotion_day_id
  join books b on b.id = d.book_id
  where b.round_id = old.id;

  if v_readers > 0 then
    raise exception
      'Days in this round have been read % time(s). Archive it instead.', v_readers
      using errcode = '23503';
  end if;

  return old;
end;
$fn$;

create or replace function block_unsafe_phase_delete() returns trigger
  language plpgsql security definer set search_path = public as $fn$
declare
  v_rounds int;
begin
  select count(*) into v_rounds from rounds where phase_id = old.id;
  if v_rounds > 0 then
    raise exception
      'This phase still contains % round(s). Move or delete them first.', v_rounds
      using errcode = '23503';
  end if;
  return old;
end;
$fn$;
