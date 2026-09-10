-- Backs a "Send join code" action on the Members page: the dashboard shows
-- every existing member, not just people still mid-onboarding, so the
-- existing onboarding-page nudge (scoped to profile-less phones — see
-- admin_onboarding_pipeline's has_profile filter) can't reach them at all.
--
-- Deliberately on-demand rather than bulk: `profiles` carries no phone number
-- (phone lives on auth.users, a protected schema an admin can't select
-- directly), and fetching every member's number into one page load is a
-- bigger privacy footprint than fetching one when an admin actually clicks
-- the button for that person.
create or replace function admin_member_phone(p_user uuid)
returns text
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_phone text;
begin
  if not auth_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select u.phone into v_phone
  from auth.users u
  join profiles p on p.id = u.id
  where u.id = p_user
    and p.church_id = auth_church_id();

  if v_phone is null then
    return null;
  end if;

  -- auth.users.phone is digits-only (E.164 without the leading +); telegram_links
  -- and telegram-nudge both key on the +-prefixed form. Same mismatch already
  -- flagged in telegram-send-otp/index.ts, fixed the same way here.
  return case when left(v_phone, 1) = '+' then v_phone else '+' || v_phone end;
end;
$fn$;
