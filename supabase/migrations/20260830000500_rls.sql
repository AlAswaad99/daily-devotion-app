-- Abide — Phase 0. Row level security.
--
-- Two rules matter more than the rest and are enforced here rather than in app code:
--   1. Admins never read reflections. There is no admin bypass policy on that table.
--   2. Future books are invisible — not listed, not browsable, not fetchable.
--
-- The admin dashboard authenticates as the admin's own user with the anon key. It
-- must never use a service-role key, which would step over every policy below.

-- Helper functions are SECURITY DEFINER so they can read `profiles` without
-- re-entering the policies that call them.
create or replace function auth_church_id() returns uuid
  language sql stable security definer set search_path = public
  as $fn$ select church_id from profiles where id = auth.uid() $fn$;

create or replace function auth_ministry_id() returns uuid
  language sql stable security definer set search_path = public
  as $fn$ select ministry_id from profiles where id = auth.uid() $fn$;

create or replace function auth_is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $fn$ select coalesce((select role = 'admin' from profiles where id = auth.uid()), false) $fn$;

-- Today in ministry time. All day arithmetic happens in EAT; timestamps stay UTC.
create or replace function ministry_today() returns date
  language sql stable
  as $fn$ select (now() at time zone 'Africa/Addis_Ababa')::date $fn$;

alter table churches               enable row level security;
alter table ministries             enable row level security;
alter table profiles               enable row level security;
alter table join_codes             enable row level security;
alter table rounds                 enable row level security;
alter table books                  enable row level security;
alter table devotion_days          enable row level security;
alter table summary_questions      enable row level security;
alter table day_completions        enable row level security;
alter table streak_events          enable row level security;
alter table streak_state           enable row level security;
alter table reflections            enable row level security;
alter table favorites              enable row level security;
alter table prayer_sessions        enable row level security;
alter table content_strings        enable row level security;
alter table notification_templates enable row level security;
alter table notification_prefs     enable row level security;
alter table broadcasts             enable row level security;
alter table app_icon_rules         enable row level security;
alter table devices                enable row level security;
alter table content_revisions      enable row level security;

-- ---------------------------------------------------------------- tenancy

create policy churches_read on churches for select to authenticated
  using (id = auth_church_id());

create policy ministries_read on ministries for select to authenticated
  using (church_id = auth_church_id());

-- A member sees their own profile and, for cohort views, the rows of their own
-- ministry. Writes are self-only.
create policy profiles_read on profiles for select to authenticated
  using (ministry_id = auth_ministry_id());

create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Join codes are consumed through a function at signup, never read by clients.
create policy join_codes_admin on join_codes for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

-- ---------------------------------------------------------------- content

create policy rounds_read on rounds for select to authenticated
  using (ministry_id = auth_ministry_id() and (status <> 'draft' or auth_is_admin()));

create policy rounds_admin_write on rounds for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

create policy books_read on books for select to authenticated
  using (
    church_id = auth_church_id()
    and (auth_is_admin() or status in ('published', 'archived'))
  );

create policy books_admin_write on books for all to authenticated
  using (auth_is_admin() and church_id = auth_church_id())
  with check (auth_is_admin() and church_id = auth_church_id());

-- Future days are invisible to members: unscheduled, or scheduled after today in EAT.
-- Past days stay readable, which is what makes backfilling and the library possible.
create policy devotion_days_read on devotion_days for select to authenticated
  using (
    church_id = auth_church_id()
    and (
      auth_is_admin()
      or (
        status = 'published'
        and scheduled_date is not null
        and scheduled_date <= ministry_today()
      )
    )
  );

create policy devotion_days_admin_write on devotion_days for all to authenticated
  using (auth_is_admin() and church_id = auth_church_id())
  with check (auth_is_admin() and church_id = auth_church_id());

create policy summary_questions_read on summary_questions for select to authenticated
  using (
    church_id = auth_church_id()
    and (
      auth_is_admin()
      or exists (
        select 1 from devotion_days d
        where d.book_id = summary_questions.book_id
          and d.kind = 'summary'
          and d.status = 'published'
          and d.scheduled_date is not null
          and d.scheduled_date <= ministry_today()
      )
    )
  );

create policy summary_questions_admin_write on summary_questions for all to authenticated
  using (auth_is_admin() and church_id = auth_church_id())
  with check (auth_is_admin() and church_id = auth_church_id());

-- ---------------------------------------------------------------- progress
-- Own-row-only, uniformly. Admin aggregate views go through a SECURITY DEFINER
-- function that returns counts and cannot return any user's text.

create policy day_completions_own on day_completions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy streak_events_own on streak_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy streak_state_own on streak_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy favorites_own on favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy prayer_sessions_own on prayer_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_prefs_own on notification_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy devices_own on devices for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reflections: the author, and nobody else. Deliberately no admin policy.
-- Adding one would be a privacy regression, and supabase/tests/rls_reflections.test.sql
-- fails if anyone ever does.
create policy reflections_own on reflections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- configuration

create policy content_strings_read on content_strings for select to authenticated
  using (ministry_id = auth_ministry_id());
create policy content_strings_admin on content_strings for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

create policy notification_templates_read on notification_templates for select to authenticated
  using (ministry_id = auth_ministry_id());
create policy notification_templates_admin on notification_templates for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

create policy broadcasts_admin on broadcasts for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

create policy app_icon_rules_read on app_icon_rules for select to authenticated
  using (ministry_id = auth_ministry_id());
create policy app_icon_rules_admin on app_icon_rules for all to authenticated
  using (auth_is_admin() and ministry_id = auth_ministry_id())
  with check (auth_is_admin() and ministry_id = auth_ministry_id());

create policy content_revisions_admin on content_revisions for all to authenticated
  using (auth_is_admin() and church_id = auth_church_id())
  with check (auth_is_admin() and church_id = auth_church_id());
