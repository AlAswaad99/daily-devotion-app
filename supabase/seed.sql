-- Local development seed. Not run against production.
--
-- Tenancy only: one church, one ministry, one join code. Devotion content is not
-- seeded here — it comes from the ministry's JSON through the Phase 1 importer, so
-- there is exactly one path content can enter the database by:
--
--   pnpm --filter @abide/content import

insert into churches (id, name_en, name_am)
values ('11111111-1111-1111-1111-111111111111',
        'BYB MKC',
        'ቤቴል የዓለም ብርሃን መሠረተ ክርስቶስ ቤተክርስቲያን');

insert into ministries (id, church_id, name_en, name_am)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'Youth Ministry', 'የወጣቶች አገልግሎት');

-- ABIDE-DEV is what the check-* scripts redeem and predates the app's code screen.
-- ABD7K2 is the shape the v3 design fixes: six alphanumeric characters, no
-- separator, because the onboarding screen draws exactly six boxes and cannot
-- express a longer or hyphenated code. New codes should follow it.
insert into join_codes (code, ministry_id, max_uses)
values ('ABIDE-DEV', '22222222-2222-2222-2222-222222222222', 1000),
       ('ABD7K2',    '22222222-2222-2222-2222-222222222222', 1000);

-- ---------------------------------------------------------------- dev account
--
-- A known account that survives `supabase db reset`. Applying a migration means
-- resetting the local database, which wipes auth.users along with everything else;
-- without this, every schema change costs whoever is testing their login.
--
-- Local only: seed.sql never runs against production.
--
--   email:    dev@abide.local
--   password: abide12345

-- The token columns must be empty strings rather than null: GoTrue scans them
-- into Go strings and a null there fails the whole sign-in with an opaque
-- "Database error querying schema".
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token,
  reauthentication_token)
values (
  '00000000-0000-0000-0000-000000000000',
  '0d0d0d0d-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'dev@abide.local',
  crypt('abide12345', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  '', '', '', '', '', '', '', '');

-- GoTrue looks up an identity row on sign-in; without it the password is never
-- checked and the login fails with "invalid credentials".
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at,
  created_at, updated_at)
values (
  gen_random_uuid(),
  '0d0d0d0d-0000-4000-8000-000000000001',
  json_build_object(
    'sub', '0d0d0d0d-0000-4000-8000-000000000001',
    'email', 'dev@abide.local',
    'email_verified', true)::jsonb,
  'email', '0d0d0d0d-0000-4000-8000-000000000001', now(), now(), now());

-- Joined three weeks ago, so there is a real calendar to look at rather than a
-- screen of pre-join grey.
-- An admin, so the same account can drive both the app and the dashboard.
insert into profiles (id, church_id, ministry_id, display_name, ui_language,
                      reader_language, part_of_day, role, joined_on)
values ('0d0d0d0d-0000-4000-8000-000000000001',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'Dev', 'en', 'am', 'morning', 'admin',
        (now() at time zone 'Africa/Addis_Ababa')::date - 21);

insert into streak_state (user_id) values ('0d0d0d0d-0000-4000-8000-000000000001');
