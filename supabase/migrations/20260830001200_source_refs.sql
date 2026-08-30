-- Abide — Phase 5. Keep what the ministry actually wrote.
--
-- `ScriptureRef.raw` preserves the original text of references we could parse, but
-- a reference we could *not* parse was simply absent from the stored array — so it
-- vanished from the editor entirely. Ruth day 2 is the case in point: the ministry
-- wrote `ዘፍ 24፡58 ፤ ኢሱ 24፡15`, the second half is a typo for ኢያሱ, and an admin
-- opening that day saw only "Genesis 24:58" with no sign anything was missing.
--
-- The spec's intent is explicit — an admin editing a day should see what the
-- ministry originally wrote, not just our parse of it — so the whole field is kept
-- as written, and the parsed array remains the machine-readable derivative.

alter table devotion_days
  add column passage_raw    text not null default '',
  add column key_verses_raw text not null default '',
  add column cross_refs_raw text not null default '';

-- Backfill from what we do have, so existing content keeps its parseable text.
update devotion_days
   set passage_raw = coalesce(passage ->> 'raw', ''),
       key_verses_raw = (
         select coalesce(string_agg(r ->> 'raw', ' ፤ '), '')
         from jsonb_array_elements(key_verses) r),
       cross_refs_raw = (
         select coalesce(string_agg(r ->> 'raw', ' ፤ '), '')
         from jsonb_array_elements(cross_refs) r);
