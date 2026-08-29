-- Local development seed. Not run against production.
--
-- Tenancy only: one church, one ministry, one join code. Devotion content is not
-- seeded here — it comes from the ministry's JSON through the Phase 1 importer, so
-- there is exactly one path content can enter the database by:
--
--   pnpm --filter @abide/content import

insert into churches (id, name_en, name_am)
values ('11111111-1111-1111-1111-111111111111',
        'Bethel Light of the World Meserete Kristos Church',
        'ቤቴል የዓለም ብርሃን መሠረተ ክርስቶስ ቤተክርስቲያን');

insert into ministries (id, church_id, name_en, name_am)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111', 'Youth Ministry', 'የወጣቶች አገልግሎት');

insert into join_codes (code, ministry_id, max_uses)
values ('ABIDE-DEV', '22222222-2222-2222-2222-222222222222', 1000);
