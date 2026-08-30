-- Abide — Phase 6. Running the planner on a schedule.
--
-- The ladder is decided by `plan_notifications`, which is deliberately idempotent,
-- so running it repeatedly through the day is safe and is in fact what makes it
-- responsive: a member who reads at 11:00 stops being a candidate for the evening
-- rungs the next time it runs.
--
-- pg_cron lives in its own schema and is only available on the database, which is
-- why this is here rather than in application code.

create extension if not exists pg_cron with schema extensions;

do $$
begin
  -- Every hour, on the hour, plan the current ministry day. Cron runs in UTC;
  -- `ministry_today()` resolves EAT itself, so there is no offset to get wrong.
  perform cron.schedule(
    'abide-plan-notifications',
    '0 * * * *',
    $cmd$ select plan_notifications(ministry_today()) $cmd$
  );

  -- Shortly after midnight EAT (21:05 UTC), plan the day that has just begun so
  -- early risers have their reminder waiting rather than planned around them.
  perform cron.schedule(
    'abide-plan-tomorrow',
    '5 21 * * *',
    $cmd$ select plan_notifications(ministry_today()) $cmd$
  );
exception
  when others then
    -- A managed Postgres that does not permit cron.schedule should not stop the
    -- migration: the planner is still callable, and the deployment can schedule it
    -- however it prefers.
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;

/**
 * What the ladder has actually been doing, for the dashboard.
 *
 * Counts by kind over a window, including how many the cap suppressed — the number
 * that tells an admin whether the ladder is trying to say more than it is allowed
 * to.
 */
create or replace function notification_activity(p_days int default 14)
  returns table (kind text, planned bigint, suppressed bigint, sent bigint)
  language sql stable security definer set search_path = public as $fn$
  select n.kind::text,
         count(*),
         count(*) filter (where n.suppressed_by is not null),
         count(*) filter (where n.sent_at is not null)
  from notifications n
  join profiles p on p.id = n.user_id
  where auth_is_admin()
    and p.ministry_id = auth_ministry_id()
    and n.ministry_date >= ministry_today() - p_days
  group by n.kind
  order by count(*) desc
$fn$;

revoke all on function notification_activity(int) from public;
grant execute on function notification_activity(int) to authenticated;
