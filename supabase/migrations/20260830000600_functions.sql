-- Abide — Phase 0. Functions: signup via join code, and admin aggregates.

create or replace function touch_updated_at() returns trigger
  language plpgsql as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();
create trigger devotion_days_touch before update on devotion_days
  for each row execute function touch_updated_at();
create trigger reflections_touch before update on reflections
  for each row execute function touch_updated_at();

-- Signup path. The client never reads join_codes; it presents one and this function
-- resolves it to a church and ministry, which is how tenancy gets established.
-- Registration gating is still open (see OPEN_QUESTIONS.md Q13) — the join code is
-- the assumed answer, and swapping it out means replacing only this function.
create or replace function redeem_join_code(
  p_code         text,
  p_display_name text,
  p_ui_language  language default 'am',
  p_part_of_day  part_of_day default 'morning'
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

  insert into profiles (id, church_id, ministry_id, display_name, ui_language,
                        reader_language, part_of_day, reminder_at)
  values (auth.uid(), v_church, v_code.ministry_id, p_display_name, p_ui_language,
          p_ui_language, p_part_of_day,
          case p_part_of_day
            when 'morning'   then time '06:00'
            when 'afternoon' then time '13:00'
            when 'evening'   then time '19:00'
            else                  time '21:30'
          end)
  returning * into v_profile;

  insert into streak_state (user_id) values (auth.uid());
  update join_codes set uses = uses + 1 where code = v_code.code;

  return v_profile;
end;
$fn$;

revoke all on function redeem_join_code(text, text, language, part_of_day) from public;
grant execute on function redeem_join_code(text, text, language, part_of_day) to authenticated;

-- Admins need engagement numbers without reading anything anyone wrote. This
-- returns counts only; there is no column here that could carry a reflection body,
-- and that is the point.
create or replace function ministry_engagement(p_from date, p_to date)
  returns table (scheduled_date date, completions bigint, reflections_written bigint)
  language sql security definer set search_path = public
as $fn$
  select d.scheduled_date,
         count(distinct c.user_id)  as completions,
         count(distinct r.user_id)  as reflections_written
  from devotion_days d
  left join day_completions c on c.devotion_day_id = d.id
  left join reflections     r on r.devotion_day_id = d.id
  where auth_is_admin()
    and d.church_id = auth_church_id()
    and d.scheduled_date between p_from and p_to
  group by d.scheduled_date
  order by d.scheduled_date;
$fn$;

revoke all on function ministry_engagement(date, date) from public;
grant execute on function ministry_engagement(date, date) to authenticated;
