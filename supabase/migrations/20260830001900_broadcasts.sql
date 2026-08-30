-- Abide — Phase 6. Broadcasts.
--
-- Admin-sent, targeted, and deliberately outside the daily cap: the cap exists to
-- stop the automated ladder becoming noise, not to silence a person addressing
-- their own ministry. That does mean a careless admin can be noisy, which is a
-- social problem rather than a technical one.

/**
 * Who a broadcast reaches.
 *
 * `target` is a jsonb object; an empty one means everybody. Supported keys:
 *   { "active_within_days": 7 }   read something in the last N days
 *   { "book_id": "…" }            currently reading that book
 *   { "streak_at_least": 7 }      streak of N or more
 *   { "streak_below": 3 }         streak under N — the people slipping away
 */
create or replace function broadcast_audience(p_target jsonb)
  returns table (user_id uuid)
  language sql stable security definer set search_path = public as $fn$
  select p.id
  from profiles p
  left join streak_state s on s.user_id = p.id
  where p.ministry_id = auth_ministry_id()
    and (
      p_target -> 'active_within_days' is null
      or exists (
        select 1 from day_completions c
        join devotion_days d on d.id = c.devotion_day_id
        where c.user_id = p.id
          and d.scheduled_date >= ministry_today()
            - (p_target ->> 'active_within_days')::int
      )
    )
    and (
      p_target -> 'book_id' is null
      or exists (
        select 1 from day_completions c
        join devotion_days d on d.id = c.devotion_day_id
        where c.user_id = p.id and d.book_id = (p_target ->> 'book_id')::uuid
      )
    )
    and (
      p_target -> 'streak_at_least' is null
      or coalesce(s.current, 0) >= (p_target ->> 'streak_at_least')::int
    )
    and (
      p_target -> 'streak_below' is null
      or coalesce(s.current, 0) < (p_target ->> 'streak_below')::int
    )
$fn$;

/** How many people a target would reach, so an admin can see before they send. */
create or replace function broadcast_reach(p_target jsonb)
  returns bigint
  language sql stable security definer set search_path = public as $fn$
  select count(*) from broadcast_audience(p_target) where auth_is_admin()
$fn$;

/**
 * Fan a broadcast out into individual notifications.
 *
 * Idempotent through the dedupe key: sending twice reaches nobody twice.
 */
create or replace function send_broadcast(p_broadcast uuid)
  returns int
  language plpgsql security definer set search_path = public as $fn$
declare
  b broadcasts;
  v_count int;
begin
  if not auth_is_admin() then
    raise exception 'only an admin can send a broadcast' using errcode = '42501';
  end if;

  select * into b from broadcasts where id = p_broadcast and ministry_id = auth_ministry_id();
  if b is null then
    raise exception 'no such broadcast' using errcode = '42501';
  end if;
  if b.sent_at is not null then
    raise exception 'that broadcast has already been sent' using errcode = '22023';
  end if;

  insert into notifications (
    user_id, kind, priority, ministry_date, send_at,
    title_en, title_am, body_en, body_am, dedupe_key, meta)
  select a.user_id, 'broadcast', notification_priority('broadcast'), ministry_today(),
         coalesce(b.scheduled_at, now()),
         b.title_en, b.title_am, b.body_en, b.body_am,
         'broadcast:' || b.id::text,
         jsonb_build_object('broadcast_id', b.id)
  from broadcast_audience(b.target) a
  -- A member who has muted broadcasts is not reached by one.
  where notification_enabled(a.user_id, b.ministry_id, 'broadcast')
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;

  update broadcasts
     set sent_at = now(), status = 'sent'
   where id = p_broadcast;

  return v_count;
end;
$fn$;

revoke all on function broadcast_audience(jsonb) from public;
revoke all on function broadcast_reach(jsonb) from public;
revoke all on function send_broadcast(uuid) from public;
grant execute on function broadcast_reach(jsonb) to authenticated;
grant execute on function send_broadcast(uuid) to authenticated;

/**
 * What is waiting to go out, for the delivery job.
 *
 * Delivery itself is not here: a job reads this, sends through FCM, and calls
 * `mark_notification_sent`. Keeping the boundary explicit is what let the whole
 * ladder be tested without a push credential.
 */
create or replace function due_notifications(p_limit int default 500)
  returns table (
    id uuid,
    user_id uuid,
    kind notification_kind,
    title_en text, title_am text, body_en text, body_am text,
    ui_language language,
    fcm_tokens text[]
  )
  language sql stable security definer set search_path = public as $fn$
  select n.id, n.user_id, n.kind, n.title_en, n.title_am, n.body_en, n.body_am,
         p.ui_language,
         coalesce(array_agg(d.fcm_token) filter (where d.fcm_token is not null), '{}')
  from notifications n
  join profiles p on p.id = n.user_id
  left join devices d on d.user_id = n.user_id
  where n.sent_at is null
    and n.suppressed_by is null
    and n.send_at <= now()
  group by n.id, n.user_id, n.kind, n.title_en, n.title_am, n.body_en, n.body_am,
           p.ui_language, n.send_at
  order by n.send_at
  limit p_limit
$fn$;

create or replace function mark_notification_sent(p_id uuid, p_error text default null)
  returns void
  language sql security definer set search_path = public as $fn$
  update notifications
     set sent_at = case when p_error is null then now() else sent_at end,
         error = p_error
   where id = p_id
$fn$;

revoke all on function due_notifications(int) from public;
revoke all on function mark_notification_sent(uuid, text) from public;
