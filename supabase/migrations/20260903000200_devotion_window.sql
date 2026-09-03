-- The devotion window: a start time and a duration, replacing a bare reminder time.
--
-- v3's onboarding asks for a window ("12:00 – 12:30 ጠዋት") rather than a part of day,
-- which inverts the old relationship: part_of_day used to be chosen and reminder_at
-- derived from it, and now the reverse is true.
--
-- reminder_at is kept as the start rather than swapped for an integer column. It
-- already means exactly that, it is already `time`, and three shipped phases read it —
-- the notification planner among them. Adding a duration beside it is additive; the
-- alternative rewrites a column the scheduler depends on to gain nothing.

alter table profiles
  add column reminder_duration_min int not null default 30
    check (reminder_duration_min between 15 and 120);

comment on column profiles.reminder_at is
  'Start of the devotion window. Local time, EAT. 15-minute steps in the UI.';
comment on column profiles.reminder_duration_min is
  'Length of the devotion window in minutes, 15 to 120. The arrival signal on Today '
  'shows while now() falls inside [reminder_at, reminder_at + this).';

-- Part of day becomes derived rather than chosen.
--
-- It cannot simply be dropped: it is not null, it drives greeting and content-string
-- selection, and the admin schedules against it. So it stays a column and gains a
-- single owner. Deriving it in the client instead would put the same rule in two
-- places, and the two would drift the first time a boundary moved — the same reason
-- the Ethiopian date arithmetic lives in one library rather than in each caller.
create or replace function part_of_day_for(p_at time)
  returns part_of_day
  language sql immutable
as $fn$
  select case
    when extract(hour from p_at) >= 6  and extract(hour from p_at) < 12 then 'morning'
    when extract(hour from p_at) >= 12 and extract(hour from p_at) < 18 then 'afternoon'
    when extract(hour from p_at) >= 18 and extract(hour from p_at) < 21 then 'evening'
    else 'night'
  end::part_of_day;
$fn$;

create or replace function profiles_derive_part_of_day()
  returns trigger
  language plpgsql
as $fn$
begin
  new.part_of_day := part_of_day_for(new.reminder_at);
  return new;
end;
$fn$;

create trigger profiles_part_of_day
  before insert or update of reminder_at on profiles
  for each row execute function profiles_derive_part_of_day();

-- Backfill: existing rows were written the other way round, so re-derive them from the
-- reminder time they already carry rather than trusting the stored part.
update profiles set reminder_at = reminder_at;

-- Signup now carries the window, because onboarding asks for it before the account
-- exists. part_of_day is no longer a parameter at all — the trigger owns it.
drop function if exists redeem_join_code(text, text, language, part_of_day);

create or replace function redeem_join_code(
  p_code                  text,
  p_display_name          text,
  p_ui_language           language default 'am',
  p_reminder_at           time     default '06:00',
  p_reminder_duration_min int      default 30
) returns profiles
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_code    join_codes;
  v_church  uuid;
  v_profile profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_reminder_duration_min not between 15 and 120 then
    raise exception 'devotion window must be 15 to 120 minutes' using errcode = '22023';
  end if;

  select * into v_code from join_codes
    where code = upper(trim(p_code)) for update;

  if v_code is null then
    raise exception 'unknown join code' using errcode = '22023';
  end if;
  if v_code.expires_at is not null and v_code.expires_at < now() then
    raise exception 'join code expired' using errcode = '22023';
  end if;
  if v_code.uses >= v_code.max_uses then
    raise exception 'join code exhausted' using errcode = '22023';
  end if;

  select church_id into v_church from ministries where id = v_code.ministry_id;

  -- part_of_day is omitted deliberately: the before-insert trigger derives it.
  insert into profiles (id, church_id, ministry_id, display_name, ui_language,
                        reader_language, reminder_at, reminder_duration_min)
  values (auth.uid(), v_church, v_code.ministry_id, p_display_name, p_ui_language,
          p_ui_language, p_reminder_at, p_reminder_duration_min)
  returning * into v_profile;

  insert into streak_state (user_id) values (auth.uid());
  update join_codes set uses = uses + 1 where code = v_code.code;

  return v_profile;
end;
$fn$;

revoke all on function redeem_join_code(text, text, language, time, int) from public;
grant execute on function redeem_join_code(text, text, language, time, int) to authenticated;
