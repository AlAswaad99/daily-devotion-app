-- Abide — Phase 6. Default copy for every rung.
--
-- Copy is content, not code: these are starting points the ministry edits in the
-- dashboard, in both languages, with variants so the same words do not arrive every
-- night. Seeded per ministry so a new ministry is not born mute.

create or replace function seed_notification_templates(p_ministry uuid)
  returns int
  language sql security definer set search_path = public as $fn$
  insert into notification_templates
    (ministry_id, kind, enabled, offset_minutes, title_en, title_am, body_en, body_am, variants)
  values
    (p_ministry, 'daily_reminder', true, 0,
     'Today''s devotion', 'የዛሬው ጥናት',
     'A few quiet minutes are waiting for you.', 'ጥቂት ጸጥታ የሞላባቸው ደቂቃዎች እየጠበቁህ ናቸው።',
     '[{"title_en":"Time to abide","title_am":"የመቆየት ጊዜ",
        "body_en":"Today''s passage is ready when you are.",
        "body_am":"የዛሬው ክፍል ዝግጁ ነው።"},
       {"title_en":"Your devotion is waiting","title_am":"ጥናትህ እየጠበቀ ነው",
        "body_en":"Four minutes with the Word.",
        "body_am":"ከቃሉ ጋር አራት ደቂቃ።"}]'::jsonb),

    (p_ministry, 'streak_at_risk', true, 0,
     'Your streak ends at midnight', 'ተከታታይህ በእኩለ ሌሊት ያበቃል',
     'Today is still open. A few minutes keeps it alive.',
     'ዛሬ አሁንም ክፍት ነው። ጥቂት ደቂቃዎች ሕያው ያደርገዋል።',
     '[{"title_en":"Still time today","title_am":"ዛሬ አሁንም ጊዜ አለ",
        "body_en":"Your streak is safe if you read before midnight.",
        "body_am":"ከእኩለ ሌሊት በፊት ካነበብክ ተከታታይህ ደህና ነው።"}]'::jsonb),

    (p_ministry, 'streak_lost', true, 0,
     'The streak broke — start again today', 'ተከታታዩ ተቋረጠ — ዛሬ እንደገና ጀምር',
     'It happens. Today is a fresh one.', 'ይህ ይከሰታል። ዛሬ አዲስ ቀን ነው።',
     '[]'::jsonb),

    (p_ministry, 'repair_available', true, 0,
     'You can repair your streak', 'ተከታታይህን መጠገን ትችላለህ',
     'A day you missed can still be put right.', 'ያመለጠህ ቀን አሁንም ሊስተካከል ይችላል።',
     '[]'::jsonb),

    (p_ministry, 'comeback_d3', true, 0,
     'It has been three days', 'ሦስት ቀናት ሆነዋል',
     'The study is still here whenever you are ready.',
     'ዝግጁ በሆንክ ጊዜ ጥናቱ እዚሁ አለ።',
     '[]'::jsonb),

    (p_ministry, 'comeback_d7', true, 0,
     'A week away', 'የአንድ ሳምንት ርቀት',
     'Pick up wherever you like — nothing is lost.',
     'ከፈለግከው ቦታ ቀጥል — ምንም አልጠፋም።',
     '[]'::jsonb),

    -- Off by default: two weeks of silence is a decision, and a third nudge after
    -- it risks being the one that gets the app deleted.
    (p_ministry, 'comeback_d14', false, 0,
     'Still here whenever you want', 'በፈለግከው ጊዜ እዚሁ አለን',
     'Your place in the study is kept.', 'በጥናቱ ውስጥ ያለህ ቦታ ተጠብቆልሃል።',
     '[]'::jsonb),

    (p_ministry, 'milestone', true, 0,
     '{streak} days', '{streak} ቀናት',
     'That is {streak} days of showing up. Well done.',
     'ይህ {streak} ቀናት መገኘት ነው። በርታ።',
     '[]'::jsonb),

    (p_ministry, 'book_complete', true, 0,
     'Book finished', 'መጽሐፉ ተጠናቀቀ',
     'You have reached the end of this study.', 'የዚህ ጥናት መጨረሻ ላይ ደርሰሃል።',
     '[]'::jsonb),

    (p_ministry, 'round_start', true, 0,
     'A new round begins today', 'አዲስ ዙር ዛሬ ይጀምራል',
     'The ministry starts together this morning.', 'አገልግሎቱ ዛሬ ጠዋት አብሮ ይጀምራል።',
     '[]'::jsonb),

    (p_ministry, 'broadcast', true, 0,
     'A message from your ministry', 'ከአገልግሎትህ የተላከ መልእክት',
     '', '',
     '[]'::jsonb)
  on conflict (ministry_id, kind) do nothing
  returning 1
$fn$;

-- Seed every ministry that exists now; new ones are seeded on creation.
select seed_notification_templates(id) from ministries;

create or replace function seed_templates_for_new_ministry() returns trigger
  language plpgsql security definer set search_path = public as $fn$
begin
  perform seed_notification_templates(new.id);
  return new;
end;
$fn$;

create trigger ministries_seed_templates after insert on ministries
  for each row execute function seed_templates_for_new_ministry();

/**
 * How many people have turned each kind off.
 *
 * The spec calls this the feedback loop that stops the ladder becoming invasive: an
 * admin who cannot see that half the ministry muted the evening nudge will keep
 * sending it.
 */
create or replace function notification_optouts()
  returns table (kind text, enabled_globally boolean, opted_out bigint, members bigint)
  language sql stable security definer set search_path = public as $fn$
  select t.kind,
         t.enabled,
         (select count(*) from notification_prefs np
           join profiles p on p.id = np.user_id
          where np.kind = t.kind and not np.enabled
            and p.ministry_id = t.ministry_id),
         (select count(*) from profiles p where p.ministry_id = t.ministry_id)
  from notification_templates t
  where auth_is_admin() and t.ministry_id = auth_ministry_id()
  order by t.kind
$fn$;

revoke all on function notification_optouts() from public;
grant execute on function notification_optouts() to authenticated;
