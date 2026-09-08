-- Temuagn — Phone + Telegram OTP.
--
-- Replaces email+password with phone + OTP. Supabase's own SMS providers don't
-- reach Ethiopian numbers affordably or reliably, so OTP delivery is routed
-- through a Telegram bot via Supabase's Send SMS Auth Hook (configured in the
-- hosted dashboard, not here — see docs/telegram-bot.md).
--
-- Before a phone number can receive an OTP it has to be linked to a Telegram
-- chat: the member opens the bot, shares their (Telegram-verified) contact, and
-- the bot records `{phone, chat_id}` here using the service-role key — never
-- under a user's own session, which is why this table carries no insert/update
-- policy for `authenticated` at all.

create table telegram_links (
  phone      text primary key,
  chat_id    bigint not null,
  linked_at  timestamptz not null default now()
);

alter table telegram_links enable row level security;

-- The bot's own writes go through the service-role key and bypass RLS
-- entirely. These policies exist only so an admin can see and reset a link.
create policy telegram_links_admin_read on telegram_links for select to authenticated
  using (auth_is_admin());

create policy telegram_links_admin_delete on telegram_links for delete to authenticated
  using (auth_is_admin());

-- The app has to know whether a phone is linked *before* it has a session —
-- this is checked on the sign-in screen, ahead of requesting an OTP.
create or replace function is_telegram_linked(p_phone text) returns boolean
  language sql stable security definer set search_path = public
  as $fn$ select exists(select 1 from telegram_links where phone = p_phone) $fn$;

revoke all on function is_telegram_linked(text) from public;
grant execute on function is_telegram_linked(text) to anon, authenticated;

-- ---------------------------------------------------------------- join codes
--
-- Codes move from "one shared code per ministry" to one-time, per-person codes
-- (the admin now batch-generates a pool of them). `max_uses` already made a
-- single-use code possible without a schema change; what was missing was any
-- record of who a code actually went to, which the admin needs to see who's
-- mid-onboarding and to reset a code that went astray.

alter table join_codes
  add column redeemed_by uuid references profiles (id) on delete set null,
  add column redeemed_at timestamptz;

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
  v_profile profiles;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
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
  values (auth.uid(), v_church, v_code.ministry_id, p_display_name, p_ui_language,
          p_ui_language, p_reminder_at, p_reminder_duration_min)
  returning * into v_profile;

  insert into streak_state (user_id) values (auth.uid());
  update join_codes set uses = uses + 1, redeemed_by = auth.uid(), redeemed_at = now()
    where code = v_code.code;

  return v_profile;
end;
$fn$;

-- ------------------------------------------------------------- admin pipeline
--
-- Everyone between "opened the bot" and "finished onboarding" — the people the
-- Users page can't show, because they don't have a profile yet. Starts from
-- `telegram_links` because linking is the first thing that happens; joins out
-- to `auth.users` (a verified phone exists) and `profiles` (onboarding
-- finished). `auth.users` has no client-facing RLS at all, which is exactly
-- why this has to be a security-definer function rather than a view.
create or replace function admin_onboarding_pipeline()
returns table (
  phone             text,
  telegram_linked_at timestamptz,
  verified_at       timestamptz,
  has_profile       boolean,
  display_name      text
)
  language plpgsql security definer set search_path = public
as $fn$
begin
  if not auth_is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  return query
    select
      tl.phone,
      tl.linked_at,
      u.created_at,
      (p.id is not null),
      p.display_name
    from telegram_links tl
    left join auth.users u on u.phone = tl.phone
    left join profiles p on p.id = u.id
    order by tl.linked_at desc;
end;
$fn$;

revoke all on function admin_onboarding_pipeline() from public;
grant execute on function admin_onboarding_pipeline() to authenticated;
