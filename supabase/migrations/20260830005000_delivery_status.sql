-- Abide — knowing what happened to each notification, and being able to try again.
--
-- Outcomes were already being written to `notifications.error`, but nothing read
-- them and nothing closed them. `mark_notification_sent` set `sent_at` only on
-- success, and `due_notifications` returns everything where `sent_at is null` — so
-- every failure was retried on every five-minute tick, for ever. Twenty-nine
-- broadcasts addressed to members with no phone were being re-attempted
-- indefinitely, and the queue grew with each run.
--
-- What was missing is not the recording. It is a status, a stopping rule, and the
-- distinction between a failure worth retrying and one that never will be.
--
-- A note on what "delivered" can honestly mean here: FCM's send API reports that it
-- *accepted* a message, not that a phone showed it. Nothing below claims otherwise —
-- `sent` means accepted by FCM, and the dashboard says so in those words.

alter table notifications
  add column if not exists status text not null default 'pending',
  add column if not exists attempts int not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

alter table notifications drop constraint if exists notifications_status_check;
alter table notifications add constraint notifications_status_check
  check (status = any (array['pending', 'sent', 'failed', 'no_device']));

/*
 * Existing rows, given the status they always had implicitly.
 *
 * The `no registered device` rows are the ones stuck in the retry loop; closing them
 * is what empties the queue.
 */
update notifications
   set status = case
     when sent_at is not null then 'sent'
     when error = 'no registered device' then 'no_device'
     when error is not null then 'failed'
     else 'pending'
   end
 where status = 'pending';

-- The queue index has to follow the new definition of "outstanding".
drop index if exists notifications_pending;
create index if not exists notifications_pending
  on notifications (send_at)
  where status = 'pending' and suppressed_by is null;

create index if not exists notifications_status
  on notifications (status, ministry_date);

-- ------------------------------------------------------------------------ the queue
/**
 * What is outstanding right now.
 *
 * `next_attempt_at` is what makes a retry a retry rather than a hammering: a
 * transient failure comes back after a delay that doubles each time.
 */
create or replace function due_notifications(p_limit integer default 500)
  returns table (id uuid, user_id uuid, kind notification_kind,
                 title_en text, title_am text, body_en text, body_am text,
                 ui_language language, fcm_tokens text[])
  language sql stable security definer set search_path = public as $fn$
  select n.id, n.user_id, n.kind, n.title_en, n.title_am, n.body_en, n.body_am,
         p.ui_language,
         coalesce(array_agg(d.fcm_token) filter (where d.fcm_token is not null), '{}')
  from notifications n
  join profiles p on p.id = n.user_id
  left join devices d on d.user_id = n.user_id
  where n.status = 'pending'
    and n.suppressed_by is null
    and n.send_at <= now()
    and (n.next_attempt_at is null or n.next_attempt_at <= now())
  group by n.id, n.user_id, n.kind, n.title_en, n.title_am, n.body_en, n.body_am,
           p.ui_language, n.send_at
  order by n.send_at
  limit p_limit
$fn$;

-- ---------------------------------------------------------------------- the outcome
/**
 * How many times a transient failure is worth retrying before it is called a failure.
 *
 * Five attempts on a doubling five-minute backoff spans about an hour and a half,
 * which covers an FCM blip without leaving a message trying to arrive tomorrow.
 */
create or replace function notification_max_attempts()
  returns int language sql immutable as $fn$ select 5 $fn$;

/**
 * Record what happened to one notification.
 *
 * `p_permanent` is the important argument. A token FCM has rejected as UNREGISTERED
 * will be rejected identically for ever — retrying it wastes an attempt every tick
 * and inflates the failure count. Transient errors are the only ones that come back.
 */
create or replace function mark_notification_result(
  p_id uuid,
  p_status text,
  p_error text default null,
  p_permanent boolean default false)
  returns void
  language plpgsql security definer set search_path = public as $fn$
declare
  v_attempts int;
begin
  update notifications
     set attempts = attempts + 1,
         last_attempt_at = now(),
         error = p_error
   where id = p_id
  returning attempts into v_attempts;

  if v_attempts is null then
    return;
  end if;

  if p_status = 'sent' then
    update notifications
       set status = 'sent', sent_at = now(), next_attempt_at = null, error = null
     where id = p_id;

  elsif p_status = 'no_device' then
    -- Closed, not retried. A member with no phone is a shortfall in reach, which
    -- the report should show, not a failure to keep attempting.
    update notifications
       set status = 'no_device', next_attempt_at = null
     where id = p_id;

  elsif p_permanent or v_attempts >= notification_max_attempts() then
    update notifications
       set status = 'failed', next_attempt_at = null
     where id = p_id;

  else
    -- Five minutes, doubling: 5, 10, 20, 40.
    update notifications
       set status = 'pending',
           next_attempt_at = now() + (interval '5 minutes' * power(2, v_attempts - 1))
     where id = p_id;
  end if;
end;
$fn$;

revoke all on function mark_notification_result(uuid, text, text, boolean) from public;

/*
 * The old name, kept so an older sender still records something sensible rather than
 * silently doing nothing. New callers use `mark_notification_result`.
 */
create or replace function mark_notification_sent(p_id uuid, p_error text default null)
  returns void
  language sql security definer set search_path = public as $fn$
  select mark_notification_result(
    p_id,
    case when p_error is null then 'sent'
         when p_error = 'no registered device' then 'no_device'
         else 'failed' end,
    p_error,
    false)
$fn$;

-- ------------------------------------------------------------------- dead tokens
/**
 * Forget a token FCM has rejected as gone.
 *
 * The app was uninstalled, or the token was reissued. Keeping it means every future
 * send spends an attempt on a phone that cannot receive, and every delivery report is
 * inflated by installs that no longer exist. If they reinstall, the app registers a
 * new token on first launch.
 */
create or replace function prune_device_token(p_token text)
  returns void
  language sql security definer set search_path = public as $fn$
  delete from devices where fcm_token = p_token
$fn$;

revoke all on function prune_device_token(text) from public;

-- --------------------------------------------------------------------- reporting
/**
 * How one broadcast landed.
 *
 * `sent` means FCM accepted it — not that a phone displayed it. There is no per
 * message delivery receipt in the send API, and the dashboard does not pretend
 * otherwise.
 */
create or replace function broadcast_delivery(p_broadcast uuid)
  returns table (status text, members bigint)
  language sql stable security definer set search_path = public as $fn$
  select n.status, count(*)
  from notifications n
  join profiles p on p.id = n.user_id
  where auth_is_admin()
    and p.ministry_id = auth_ministry_id()
    and n.meta ->> 'broadcast_id' = p_broadcast::text
  group by n.status
$fn$;

revoke all on function broadcast_delivery(uuid) from public;
grant execute on function broadcast_delivery(uuid) to authenticated;

/**
 * The last several broadcasts and how each one landed, in one query.
 *
 * One call rather than one per broadcast: the dashboard lists these together, and
 * a request per row is how a list of ten becomes eleven round trips.
 */
create or replace function broadcast_delivery_overview(p_limit int default 10)
  returns table (
    id uuid, title_en text, title_am text, sent_at timestamptz,
    sent bigint, failed bigint, no_device bigint, pending bigint)
  language sql stable security definer set search_path = public as $fn$
  select b.id, b.title_en, b.title_am, b.sent_at,
         count(*) filter (where n.status = 'sent'),
         count(*) filter (where n.status = 'failed'),
         count(*) filter (where n.status = 'no_device'),
         count(*) filter (where n.status = 'pending')
  from broadcasts b
  left join notifications n on n.meta ->> 'broadcast_id' = b.id::text
  where auth_is_admin()
    and b.ministry_id = auth_ministry_id()
    and b.status = 'sent'
  group by b.id, b.title_en, b.title_am, b.sent_at
  order by b.sent_at desc nulls last
  limit p_limit
$fn$;

revoke all on function broadcast_delivery_overview(int) from public;
grant execute on function broadcast_delivery_overview(int) to authenticated;

/**
 * Who, by name, so an admin can act on it rather than only count it.
 */
create or replace function broadcast_delivery_detail(p_broadcast uuid)
  returns table (user_id uuid, display_name text, status text,
                 attempts int, error text)
  language sql stable security definer set search_path = public as $fn$
  select n.user_id, p.display_name, n.status, n.attempts, n.error
  from notifications n
  join profiles p on p.id = n.user_id
  where auth_is_admin()
    and p.ministry_id = auth_ministry_id()
    and n.meta ->> 'broadcast_id' = p_broadcast::text
  order by
    case n.status when 'failed' then 0 when 'no_device' then 1
                  when 'pending' then 2 else 3 end,
    p.display_name
$fn$;

revoke all on function broadcast_delivery_detail(uuid) from public;
grant execute on function broadcast_delivery_detail(uuid) to authenticated;

/**
 * Try the failures again.
 *
 * The original wording is reused deliberately — the variables are not re-rendered.
 * A resend is another attempt at one message, and re-rendering would mean the copy
 * someone receives on Thursday differs from what everyone else got on Tuesday.
 *
 * Members recorded as `no_device` are included only if they have registered a phone
 * since, which is exactly when retrying them becomes worthwhile.
 */
create or replace function resend_broadcast_failures(p_broadcast uuid)
  returns integer
  language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  if not auth_is_admin() then
    raise exception 'only an admin can resend a broadcast' using errcode = '42501';
  end if;

  update notifications n
     set status = 'pending', attempts = 0, next_attempt_at = null,
         error = null, send_at = now()
    from profiles p
   where p.id = n.user_id
     and p.ministry_id = auth_ministry_id()
     and n.meta ->> 'broadcast_id' = p_broadcast::text
     and (
       n.status = 'failed'
       or (n.status = 'no_device'
           and exists (select 1 from devices d where d.user_id = n.user_id))
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke all on function resend_broadcast_failures(uuid) from public;
grant execute on function resend_broadcast_failures(uuid) to authenticated;

-- --------------------------------------------------------------------- retention
/**
 * Per-notification rows are kept for 90 days.
 *
 * Long enough to investigate a bad send and see a season's trend, short enough that
 * the table does not grow without bound — one row per member per notification adds
 * up quickly once the ministry is large.
 */
create or replace function prune_notifications()
  returns integer
  language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  delete from notifications where ministry_date < ministry_today() - 90;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke all on function prune_notifications() from public;

do $$
begin
  perform cron.schedule(
    'abide-prune-notifications',
    '30 2 * * *',
    $cmd$ select prune_notifications() $cmd$
  );
exception
  when others then
    raise notice 'notification pruning scheduling skipped: %', sqlerrm;
end;
$$;
