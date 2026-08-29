-- pgTAP powers supabase/tests. Kept in a migration of its own so it can be dropped
-- from a production deploy independently of the schema.
create extension if not exists pgtap with schema extensions;
