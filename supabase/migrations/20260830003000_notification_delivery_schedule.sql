-- Abide — closing the notification loop.
--
-- The planner has been scheduled since Phase 6, but delivery was not: planned rows
-- and admin broadcasts accumulated in the queue until someone ran
-- `scripts/send-notifications.mjs` by hand. From the dashboard that was
-- indistinguishable from a broken Send button — the message was queued for every
-- member and then simply never arrived.
--
-- Sending needs the Firebase credential, which cannot live in the database, so the
-- hop is: pg_cron → pg_net → the `send-notifications` Edge Function, which holds the
-- credential as a function secret.

create extension if not exists pg_net with schema extensions;

/*
 * Where to reach the function, and what to authenticate with.
 *
 * Both are read from the vault so this migration carries no key. The defaults are
 * the local stack's: `kong` is how the database container reaches the API gateway,
 * and the demo service-role key is the one every local Supabase prints. Neither is a
 * secret, and neither is reachable from a deployed database — set the vault entries
 * there and these are never consulted.
 */
create or replace function notification_dispatch_target()
  returns table (url text, service_key text)
  language plpgsql stable security definer set search_path = public, extensions as $fn$
declare
  v_base text;
  v_key text;
begin
  begin
    select decrypted_secret into v_base
      from vault.decrypted_secrets where name = 'abide_functions_url';
    select decrypted_secret into v_key
      from vault.decrypted_secrets where name = 'abide_service_role_key';
  exception when others then
    -- No vault, or no permission to read it: fall through to the local defaults.
    null;
  end;

  url := coalesce(v_base, 'http://kong:8000/functions/v1') || '/send-notifications';
  service_key := coalesce(
    v_key,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  );
  return next;
end;
$fn$;

revoke all on function notification_dispatch_target() from public;

/**
 * Ask the Edge Function to flush the queue.
 *
 * Fire-and-forget: pg_net queues the request and returns immediately, so a slow or
 * unreachable function cannot hold a cron slot open. Overlapping runs are harmless
 * because `due_notifications` only ever returns rows that are still unsent.
 */
create or replace function dispatch_notifications()
  returns bigint
  language plpgsql security definer set search_path = public, extensions as $fn$
declare
  v_target record;
begin
  select * into v_target from notification_dispatch_target();

  return net.http_post(
    url := v_target.url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || v_target.service_key
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
end;
$fn$;

revoke all on function dispatch_notifications() from public;

do $$
begin
  -- Every five minutes. A broadcast an admin sends is worth delivering promptly;
  -- the ladder's own notifications are planned hourly and are not time-critical to
  -- the minute, so this is chosen for the broadcast case.
  perform cron.schedule(
    'abide-send-notifications',
    '*/5 * * * *',
    $cmd$ select dispatch_notifications() $cmd$
  );
exception
  when others then
    raise notice 'notification delivery scheduling skipped: %', sqlerrm;
end;
$$;
