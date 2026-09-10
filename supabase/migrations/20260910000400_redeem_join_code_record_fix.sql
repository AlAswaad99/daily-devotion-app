-- Follow-up to 20260910000200_redeem_join_code_idempotent.sql, already applied
-- to the hosted project before this bug was found — a migration's content is
-- never safe to retroactively rewrite once shipped, so this supersedes it
-- with a corrected function body instead of editing history.
--
-- v_profile is declared `record`, not `profiles`. Tracked down a genuinely
-- strange bug the hard way: a variable declared with the SAME composite type
-- as the table it's selected from (`v_profile profiles`), inside a function
-- with two or more conditional branches, silently fails to match a row that
-- provably exists, is visible to the same role via count(*)/an aliased
-- select, and — with only a single conditional in the function — is found
-- correctly by the exact same query. Reproduced minimally (bare declare +
-- select + one early-return if + one inert, always-false second if is
-- already enough) and confirmed against both local Postgres 17 and the
-- hosted project's Postgres 15, so it isn't a local-only artifact. `record`
-- sidesteps whatever the interaction is — confirmed fixed with the identical
-- surrounding structure, and re-verified against a live authenticated
-- session through the deployed function afterward. Too narrow to chase
-- further than that here.
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
  v_profile record;
  v_uid     uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select p.* into v_profile from profiles p where p.id = v_uid;
  if v_profile.id is not null then
    return v_profile;
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
  values (v_uid, v_church, v_code.ministry_id, p_display_name, p_ui_language,
          p_ui_language, p_reminder_at, p_reminder_duration_min)
  returning * into v_profile;

  insert into streak_state (user_id) values (v_uid);
  update join_codes set uses = uses + 1, redeemed_by = v_uid, redeemed_at = now()
    where code = v_code.code;

  return v_profile;
end;
$fn$;

-- `create or replace function` preserves existing grants, so nothing to redo here.
