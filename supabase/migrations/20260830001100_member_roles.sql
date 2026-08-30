-- Abide — Phase 5. Admins can change a member's role.
--
-- `profiles` is self-update only, which is right: nobody should be able to edit
-- someone else's language, reminder time or join date. But the dashboard has to be
-- able to make somebody an admin, and without this the control would appear to work
-- and change nothing.
--
-- A narrow function rather than a broad update policy: this can set exactly one
-- column, on a member of the caller's own ministry, and nothing else.

create or replace function set_member_role(p_user uuid, p_role user_role)
  returns profiles
  language plpgsql security definer set search_path = public
as $fn$
declare
  v_row profiles;
begin
  if not auth_is_admin() then
    raise exception 'only an admin can change a role' using errcode = '42501';
  end if;

  -- An admin cannot demote themselves: with one admin, that would lock the
  -- ministry out of its own dashboard with no way back in.
  if p_user = auth.uid() then
    raise exception 'you cannot change your own role' using errcode = '22023';
  end if;

  update profiles
     set role = p_role
   where id = p_user
     and ministry_id = auth_ministry_id()
  returning * into v_row;

  if v_row is null then
    raise exception 'no such member in this ministry' using errcode = '42501';
  end if;

  return v_row;
end;
$fn$;

revoke all on function set_member_role(uuid, user_role) from public;
grant execute on function set_member_role(uuid, user_role) to authenticated;
