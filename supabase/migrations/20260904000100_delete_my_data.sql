-- "Delete my data", which the app stores require and the member deserves anyway.
--
-- One row. Every table holding member-owned data — reflections, favorites,
-- completions, streak state and events, prayer sessions, devices, notifications and
-- their preferences — carries `on delete cascade` from `profiles`, so deleting the
-- profile takes all of it. Doing this as a list of deletes in the client would be the
-- same work with more ways to half-finish it, and under RLS a partial failure leaves
-- somebody's reflections behind after they asked for them to be gone.
--
-- The auth user is deliberately left in place: removing it needs the admin API, and a
-- member who signs in again should land in onboarding as a stranger rather than hit an
-- error. Nothing they wrote survives, which is what was asked for.
--
-- Authorship records (broadcasts, templates, content revisions) reference profiles with
-- `no action`, so an admin who has published something cannot delete themselves this
-- way and will get a foreign-key error rather than a silent partial wipe. That is the
-- right outcome: ministry content outliving its author is a separate decision, and it
-- should be made deliberately rather than by a member tapping a red link.

create or replace function delete_my_data()
  returns void
  language plpgsql security definer set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from profiles where id = auth.uid();
end;
$fn$;

revoke all on function delete_my_data() from public;
grant execute on function delete_my_data() to authenticated;
