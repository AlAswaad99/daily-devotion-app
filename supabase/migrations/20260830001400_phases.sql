-- Abide — Phase 5. Phases as records, and delete protection.
--
-- A phase was a code on the round. That was faithful to the ministry's exports, but
-- it made a phase something you could only bring into existence by typing it, never
-- rename and never describe. It is now a record with a bilingual title.
--
-- `rounds.phase_code` stays, kept in step by trigger, because the app reads it for
-- the round header and there is no reason to make every reader join a table to
-- render two characters.

create table phases (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null references churches (id),
  ministry_id uuid not null references ministries (id) on delete cascade,
  code        text not null,
  title_en    text not null default '',
  title_am    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (ministry_id, code)
);

create trigger phases_touch before update on phases
  for each row execute function touch_updated_at();

alter table rounds add column phase_id uuid references phases (id);

-- Backfill one phase per distinct code already in use, then point the rounds at it.
insert into phases (church_id, ministry_id, code)
select distinct r.church_id, r.ministry_id, r.phase_code from rounds r;

update rounds r
   set phase_id = p.id
  from phases p
 where p.ministry_id = r.ministry_id and p.code = r.phase_code;

/**
 * Keep the denormalised code in step.
 *
 * The round carries `phase_code` for display; the phase owns it. Writing to the
 * round without a code, or changing the phase's code, must not leave the two
 * disagreeing.
 */
create or replace function sync_round_phase_code() returns trigger
  language plpgsql as $fn$
begin
  if new.phase_id is not null then
    select code into new.phase_code from phases where id = new.phase_id;
    return new;
  end if;

  -- A writer that knows only the code — the CLI importer, the ministry's JSON —
  -- gets the phase found or created for it, so there is no way to end up with a
  -- round whose phase does not exist.
  if new.phase_code is not null then
    insert into phases (church_id, ministry_id, code)
    values (new.church_id, new.ministry_id, new.phase_code)
    on conflict (ministry_id, code) do nothing;

    select id into new.phase_id
    from phases
    where ministry_id = new.ministry_id and code = new.phase_code;
  end if;

  return new;
end;
$fn$;

create trigger rounds_sync_phase_code before insert or update on rounds
  for each row execute function sync_round_phase_code();

create or replace function cascade_phase_code() returns trigger
  language plpgsql as $fn$
begin
  if new.code is distinct from old.code then
    update rounds set phase_code = new.code where phase_id = new.id;
  end if;
  return new;
end;
$fn$;

create trigger phases_cascade_code after update on phases
  for each row execute function cascade_phase_code();

alter table phases enable row level security;

create policy phases_read on phases for select to authenticated
  using (ministry_id = auth_ministry_id());

create policy phases_admin_write on phases for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

-- --------------------------------------------------------- delete protection
--
-- Deleting content somebody has read would take their streak with it: completions
-- cascade from the day. Published or archived content, and anything anyone has
-- read, can therefore only be archived. Drafts nobody has touched delete freely.
--
-- Enforced by trigger rather than in the dashboard, so no path — a stray API call,
-- a future screen, a script — can route around it.

create or replace function block_unsafe_day_delete() returns trigger
  language plpgsql as $fn$
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

create trigger devotion_days_block_unsafe_delete before delete on devotion_days
  for each row execute function block_unsafe_day_delete();

create or replace function block_unsafe_book_delete() returns trigger
  language plpgsql as $fn$
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

create trigger books_block_unsafe_delete before delete on books
  for each row execute function block_unsafe_book_delete();

create or replace function block_unsafe_round_delete() returns trigger
  language plpgsql as $fn$
declare
  v_live int;
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

  return old;
end;
$fn$;

create trigger rounds_block_unsafe_delete before delete on rounds
  for each row execute function block_unsafe_round_delete();

create or replace function block_unsafe_phase_delete() returns trigger
  language plpgsql as $fn$
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

create trigger phases_block_unsafe_delete before delete on phases
  for each row execute function block_unsafe_phase_delete();
