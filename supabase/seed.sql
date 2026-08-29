-- Local development seed. Not run against production.
-- Gives a fresh `supabase db reset` enough to sign in against: one church, one
-- ministry, a join code, and a handful of scheduled days around today so the
-- Today screen is not empty. Real content arrives with the Phase 1 importer.

insert into churches (id, name_en, name_am)
values ('11111111-1111-1111-1111-111111111111', 'Dev Church', 'የልማት ቤተክርስቲያን');

insert into ministries (id, church_id, name_en, name_am)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'Youth Ministry', 'የወጣቶች አገልግሎት');

insert into join_codes (code, ministry_id, max_uses)
values ('ABIDE-DEV', '22222222-2222-2222-2222-222222222222', 1000);

insert into rounds (id, church_id, ministry_id, phase_code, round_code,
                    main_verse_en, main_verse_am, starts_on, status)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', '03', '01',
        'Trust in the LORD with all your heart.',
        'በፍጹም ልብህ በእግዚአብሔር ታመን።',
        current_date - 5, 'published');

insert into books (id, church_id, round_id, sequence, source_id,
                   title_en, title_am, status, published_at)
values ('44444444-4444-4444-4444-444444444444',
        '11111111-1111-1111-1111-111111111111',
        '33333333-3333-3333-3333-333333333333', 1, 'BOOK 01',
        'Ruth', 'ሩት', 'published', now());

-- Days -5..+3 relative to today: past days are readable and backfillable, future
-- days exist in the table but RLS hides them from members.
insert into devotion_days (church_id, book_id, day_number, kind,
                           topic_en, topic_am, purpose_en, purpose_am,
                           prayer_en, prayer_am, expected_seconds,
                           scheduled_date, status)
select '11111111-1111-1111-1111-111111111111',
       '44444444-4444-4444-4444-444444444444',
       n + 6,
       (case when n = 3 then 'summary' else 'devotion' end)::day_kind,
       'Placeholder day ' || (n + 6),
       'ናሙና ቀን ' || (n + 6),
       'Seed content. Replaced by the Phase 1 importer.',
       'የናሙና ይዘት። በደረጃ 1 አስመጪ ይተካል።',
       'Pray for the ministry.',
       'ስለ አገልግሎቱ ጸልይ።',
       90,
       current_date + n,
       'published'
from generate_series(-5, 3) as n;

insert into summary_questions (church_id, book_id, ordinal, question_en, question_am)
values ('11111111-1111-1111-1111-111111111111',
        '44444444-4444-4444-4444-444444444444', 1,
        'What did Ruth teach you about loyalty?', 'ሩት ስለ ታማኝነት ምን አስተማረችህ?');
