-- Abide — dispatching broadcasts, and everything the composer needs to tell the
-- truth before one goes out.

/**
 * Fan one broadcast out to the members it is for, right now.
 *
 * This is where the audience is resolved and the copy rendered, which is the whole
 * point of deferring it: a broadcast scheduled on Monday for Friday reaches Friday's
 * members with Friday's streaks.
 *
 * `security definer` and taking the ministry from the row rather than the session,
 * because the dispatcher runs under pg_cron where there is no `auth.uid()`.
 *
 * Idempotent twice over — the `sending` claim stops two runs overlapping, and the
 * `(user_id, dedupe_key)` unique constraint stops a re-run duplicating anything.
 */
create or replace function dispatch_broadcast(p_broadcast uuid)
  returns integer
  language plpgsql security definer set search_path = public as $fn$
declare
  b broadcasts;
  v_count int;
begin
  -- Claim it. `for update skip locked` means a concurrent dispatcher moves on
  -- rather than waiting to do work that is already being done.
  select * into b from broadcasts
   where id = p_broadcast
     and status in ('draft', 'scheduled', 'sending')
   for update skip locked;

  if b.id is null then
    return 0;
  end if;

  update broadcasts set status = 'sending' where id = b.id;

  with audience as (
    select p.id as user_id, p.ui_language as lang
    from broadcast_audience(b.target, b.ministry_id) a
    join profiles p on p.id = a.user_id
    -- A member who has muted broadcasts is not reached by one.
    where notification_enabled(p.id, b.ministry_id, 'broadcast')
  ),
  rendered as (
    select
      a.user_id,
      a.lang,
      /*
       * Both languages are rendered and stored; delivery picks the member's own.
       * When one language was left blank the other stands in — a missing
       * translation must not mean a member hears nothing.
       */
      render_notification_copy(
        coalesce(nullif(b.title_en, ''), b.title_am),
        notification_variables(a.user_id, 'en')) as title_en,
      render_notification_copy(
        coalesce(nullif(b.title_am, ''), b.title_en),
        notification_variables(a.user_id, 'am')) as title_am,
      render_notification_copy(
        coalesce(nullif(b.body_en, ''), b.body_am),
        notification_variables(a.user_id, 'en')) as body_en,
      render_notification_copy(
        coalesce(nullif(b.body_am, ''), b.body_en),
        notification_variables(a.user_id, 'am')) as body_am
    from audience a
  )
  insert into notifications (
    user_id, kind, priority, ministry_date, send_at,
    title_en, title_am, body_en, body_am, dedupe_key, meta)
  select r.user_id, 'broadcast', notification_priority('broadcast'), ministry_today(),
         now(),
         coalesce(r.title_en, r.title_am), coalesce(r.title_am, r.title_en),
         coalesce(r.body_en, r.body_am), coalesce(r.body_am, r.body_en),
         'broadcast:' || b.id::text,
         jsonb_build_object('broadcast_id', b.id)
  from rendered r
  /*
   * Skip anyone whose own language rendered to nothing. That happens when every
   * sentence relied on a variable they have no value for — sending them an empty
   * notification would be worse than sending none.
   */
  where case when r.lang = 'am' then r.body_am else r.body_en end is not null
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;

  update broadcasts
     set status = 'sent', sent_at = coalesce(sent_at, now()), dispatched_at = now()
   where id = b.id;

  return v_count;
end;
$fn$;

revoke all on function dispatch_broadcast(uuid) from public;

/**
 * Every broadcast that has come due. Called by pg_cron.
 */
create or replace function dispatch_broadcasts()
  returns integer
  language plpgsql security definer set search_path = public as $fn$
declare
  v_id uuid;
  v_total int := 0;
begin
  for v_id in
    select id from broadcasts
     where status in ('scheduled', 'sending')
       and coalesce(scheduled_at, now()) <= now()
     order by coalesce(scheduled_at, now())
  loop
    v_total := v_total + dispatch_broadcast(v_id);
  end loop;

  return v_total;
end;
$fn$;

revoke all on function dispatch_broadcasts() from public;

-- ------------------------------------------------------------------ admin actions
/**
 * Send now: fan out immediately rather than waiting for the next cron tick, so the
 * dashboard's Send button feels like a send and not like a queue.
 */
create or replace function send_broadcast(p_broadcast uuid)
  returns integer
  language plpgsql security definer set search_path = public as $fn$
declare
  v_ministry uuid;
begin
  if not auth_is_admin() then
    raise exception 'only an admin can send a broadcast' using errcode = '42501';
  end if;

  select ministry_id into v_ministry from broadcasts where id = p_broadcast;
  if v_ministry is null or v_ministry <> auth_ministry_id() then
    raise exception 'no such broadcast' using errcode = '42501';
  end if;

  if exists (select 1 from broadcasts
              where id = p_broadcast and status in ('sent', 'cancelled')) then
    raise exception 'that broadcast has already been sent' using errcode = '22023';
  end if;

  update broadcasts set scheduled_at = null where id = p_broadcast;
  return dispatch_broadcast(p_broadcast);
end;
$fn$;

/**
 * Schedule for later. Nothing is fanned out now, which is what keeps it editable and
 * cancellable right up until it goes.
 */
create or replace function schedule_broadcast(p_broadcast uuid, p_at timestamptz)
  returns void
  language plpgsql security definer set search_path = public as $fn$
begin
  if not auth_is_admin() then
    raise exception 'only an admin can schedule a broadcast' using errcode = '42501';
  end if;

  if p_at <= now() then
    raise exception 'that time has already passed' using errcode = '22023';
  end if;

  update broadcasts
     set scheduled_at = p_at, status = 'scheduled'
   where id = p_broadcast
     and ministry_id = auth_ministry_id()
     and status in ('draft', 'scheduled');

  if not found then
    raise exception 'no such broadcast, or it has already gone out' using errcode = '42501';
  end if;
end;
$fn$;

/**
 * Cancel one that has not gone yet. Possible only because nothing was fanned out.
 */
create or replace function cancel_broadcast(p_broadcast uuid)
  returns void
  language plpgsql security definer set search_path = public as $fn$
begin
  if not auth_is_admin() then
    raise exception 'only an admin can cancel a broadcast' using errcode = '42501';
  end if;

  update broadcasts set status = 'cancelled'
   where id = p_broadcast
     and ministry_id = auth_ministry_id()
     and status in ('draft', 'scheduled');

  if not found then
    raise exception 'no such broadcast, or it has already gone out' using errcode = '42501';
  end if;
end;
$fn$;

-- ------------------------------------------------------------- what the admin sees
/**
 * Who this would actually reach, and who it would not.
 *
 * "Queued for 20" is not a useful number on its own. Muted members and members with
 * no phone are both invisible losses, and `skipped_no_copy` is the one unique to
 * personalisation: people for whom every sentence depended on a value they do not
 * have.
 */
create or replace function broadcast_audience_summary(
  p_target jsonb,
  p_title_en text default '',
  p_title_am text default '',
  p_body_en text default '',
  p_body_am text default '')
  returns table (
    matched bigint,
    muted bigint,
    no_device bigint,
    skipped_no_copy bigint,
    already_today bigint)
  language sql stable security definer set search_path = public as $fn$
  with audience as (
    select p.id as user_id, p.ui_language as lang
    from broadcast_audience(p_target, auth_ministry_id()) a
    join profiles p on p.id = a.user_id
  ),
  judged as (
    select
      a.user_id,
      notification_enabled(a.user_id, auth_ministry_id(), 'broadcast') as allowed,
      exists (select 1 from devices d where d.user_id = a.user_id) as has_device,
      render_notification_copy(
        case when a.lang = 'am'
             then coalesce(nullif(p_body_am, ''), p_body_en)
             else coalesce(nullif(p_body_en, ''), p_body_am) end,
        notification_variables(a.user_id, a.lang)) as body,
      (select count(*) from notifications n
        where n.user_id = a.user_id
          and n.ministry_date = ministry_today()
          and n.suppressed_by is null) as today_count
    from audience a
  )
  select
    count(*) filter (where allowed),
    count(*) filter (where not allowed),
    count(*) filter (where allowed and not has_device),
    count(*) filter (where allowed and body is null),
    count(*) filter (where allowed and today_count >= 2)
  from judged
$fn$;

revoke all on function broadcast_audience_summary(jsonb, text, text, text, text) from public;
grant execute on function broadcast_audience_summary(jsonb, text, text, text, text) to authenticated;

/**
 * Exactly what one member would receive, in their own language, with their own
 * values and fallbacks. Nulls mean that member would be skipped.
 */
create or replace function preview_broadcast(
  p_user uuid,
  p_title_en text default '',
  p_title_am text default '',
  p_body_en text default '',
  p_body_am text default '')
  returns table (display_name text, lang language, title text, body text)
  language sql stable security definer set search_path = public as $fn$
  select
    p.display_name,
    p.ui_language,
    render_notification_copy(
      case when p.ui_language = 'am'
           then coalesce(nullif(p_title_am, ''), p_title_en)
           else coalesce(nullif(p_title_en, ''), p_title_am) end,
      notification_variables(p.id, p.ui_language)),
    render_notification_copy(
      case when p.ui_language = 'am'
           then coalesce(nullif(p_body_am, ''), p_body_en)
           else coalesce(nullif(p_body_en, ''), p_body_am) end,
      notification_variables(p.id, p.ui_language))
  from profiles p
  where p.id = p_user
    and p.ministry_id = auth_ministry_id()
    and auth_is_admin()
$fn$;

revoke all on function preview_broadcast(uuid, text, text, text, text) from public;
grant execute on function preview_broadcast(uuid, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------- the schedule
do $$
begin
  -- Alongside delivery. Dispatch turns due broadcasts into notifications; the
  -- delivery job then carries them to FCM, so a scheduled broadcast lands within
  -- two ticks of its time.
  perform cron.schedule(
    'abide-dispatch-broadcasts',
    '*/5 * * * *',
    $cmd$ select dispatch_broadcasts() $cmd$
  );
exception
  when others then
    raise notice 'broadcast dispatch scheduling skipped: %', sqlerrm;
end;
$$;
