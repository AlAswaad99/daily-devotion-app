-- Delivery outcomes, retries, and resending.
--
-- The regression this file exists to prevent: a notification that cannot succeed
-- being retried on every tick for ever. `mark_notification_sent` only stamped
-- `sent_at` on success and `due_notifications` returned everything unsent, so
-- failures never left the queue. Thirty-three of them had accumulated.

begin;
select plan(18);

set local role postgres;

insert into churches (id, name_en, name_am)
  values ('c0000000-0000-4000-8000-000000000001', 'Deliver', 'ማድረስ');
insert into ministries (id, church_id, name_en, name_am)
  values ('c0000000-0000-4000-8000-000000000002',
          'c0000000-0000-4000-8000-000000000001', 'Youth', 'ወጣቶች');

insert into auth.users (id, email, instance_id, aud, role) values
  ('c0000000-0000-4000-8000-00000000000a', 'lead2@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-00000000000b', 'phone@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-00000000000c', 'nophone@example.com',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into profiles (id, church_id, ministry_id, display_name, role, reminder_at, joined_on)
values
  ('c0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', 'Lead', 'admin', '06:00', ministry_today()),
  ('c0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', 'Phone', 'user', '06:00', ministry_today()),
  ('c0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000001',
   'c0000000-0000-4000-8000-000000000002', 'NoPhone', 'user', '06:00', ministry_today());

insert into devices (user_id, fcm_token, platform, last_seen)
  values ('c0000000-0000-4000-8000-00000000000b', 'tok-b', 'android', now());

/** One pending notification for a member, returning its id. */
create or replace function _queue(p_user uuid, p_key text) returns uuid
  language sql as $fn$
  insert into notifications (user_id, kind, priority, ministry_date, send_at,
                             title_en, title_am, body_en, body_am, dedupe_key, meta)
  values (p_user, 'broadcast', 90, ministry_today(), now(),
          'T', 'T', 'B', 'B', p_key,
          jsonb_build_object('broadcast_id', 'c0000000-0000-4000-8000-0000000000f1'))
  returning id
$fn$;

create temporary view ours as
  select * from notifications
   where user_id::text like 'c0000000-0000-4000-8000-00000000000%';

-- ------------------------------------------------------------------------ success
/*
 * Queued in its own statement. Calling `_queue` inside the WHERE of the assertion
 * inserts the row, but the surrounding SELECT reads the snapshot taken when the
 * statement began, so it cannot see it — every assertion came back NULL.
 */
select _queue('c0000000-0000-4000-8000-00000000000b', 'k1');
select is((select status from ours where dedupe_key = 'k1'),
  'pending', 'a new notification starts out pending');

select lives_ok(
  $$ select mark_notification_result(
       (select id from ours where dedupe_key = 'k1'), 'sent') $$,
  'a successful send is recorded');

select is((select status from ours where dedupe_key = 'k1'), 'sent',
  'and leaves the notification sent');

select ok((select sent_at is not null from ours where dedupe_key = 'k1'),
  'with the time it was accepted');

-- ---------------------------------------------------------------------- no device
select _queue('c0000000-0000-4000-8000-00000000000c', 'k2');
select is((select status from ours where dedupe_key = 'k2'),
  'pending', 'a member with no phone is still queued, so the shortfall is visible');

select lives_ok(
  $$ select mark_notification_result(
       (select id from ours where dedupe_key = 'k2'), 'no_device', 'no registered device') $$,
  'and their outcome is recorded');

select is((select status from ours where dedupe_key = 'k2'), 'no_device',
  'as no_device');

/*
 * The regression. Before this, a no_device row stayed `sent_at is null` and so came
 * back on every single run, for ever.
 */
select ok(
  not exists (select 1 from due_notifications(500) d where d.id =
              (select id from ours where dedupe_key = 'k2')),
  'a member with no phone is never retried — this is the loop that filled the queue');

-- ------------------------------------------------------------ transient failures
select _queue('c0000000-0000-4000-8000-00000000000b', 'k3');
select is((select status from ours where dedupe_key = 'k3'),
  'pending', 'a third notification is queued');

select lives_ok(
  $$ select mark_notification_result(
       (select id from ours where dedupe_key = 'k3'), 'failed', '503 UNAVAILABLE', false) $$,
  'a transient failure is recorded');

select is((select status from ours where dedupe_key = 'k3'), 'pending',
  'a transient failure stays pending, because it may well succeed next time');

select ok((select next_attempt_at > now() from ours where dedupe_key = 'k3'),
  'but not immediately — it backs off');

select ok(
  not exists (select 1 from due_notifications(500) d where d.id =
              (select id from ours where dedupe_key = 'k3')),
  'and it is not due again until that time, rather than retried on the next tick');

-- Exhaust the remaining attempts.
do $$
declare v_id uuid;
begin
  select id into v_id from notifications where dedupe_key = 'k3';
  for i in 2..notification_max_attempts() loop
    update notifications set next_attempt_at = null where id = v_id;
    perform mark_notification_result(v_id, 'failed', '503 UNAVAILABLE', false);
  end loop;
end;
$$;

select is((select status from ours where dedupe_key = 'k3'), 'failed',
  'after enough attempts a transient failure is given up on');

-- ------------------------------------------------------------ permanent failures
select _queue('c0000000-0000-4000-8000-00000000000b', 'k4');
select lives_ok(
  $$ select mark_notification_result(
       (select id from notifications where dedupe_key = 'k4'),
       'failed', '404 UNREGISTERED', true) $$,
  'a permanent failure is recorded');

select is((select attempts from ours where dedupe_key = 'k4'), 1,
  'a permanent failure is not retried even once — the token is gone, not busy');

-- --------------------------------------------------------------------- resending
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is(resend_broadcast_failures('c0000000-0000-4000-8000-0000000000f1'), 2,
  'resending picks up the failures, and leaves the member with no phone alone');

set local role postgres;
insert into devices (user_id, fcm_token, platform, last_seen)
  values ('c0000000-0000-4000-8000-00000000000c', 'tok-c', 'android', now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select is(resend_broadcast_failures('c0000000-0000-4000-8000-0000000000f1'), 1,
  'once they register a phone, the message they missed can be sent after all');

select * from finish();
rollback;
