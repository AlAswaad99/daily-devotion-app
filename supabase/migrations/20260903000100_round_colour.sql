-- Abide — a colour per round, so the schedule calendar can be read as blocks.
--
-- The colour lives on the round rather than the phase or the book because a round
-- is the thing the calendar actually lays out: a contiguous run of dates. A phase
-- spans months and would tint a whole month view one colour; a book would change
-- colour mid-round and break the block into stripes.
--
-- Stored as a key, not a hex. The admin picks from a fixed palette that was checked
-- for contrast and colour-vision separation against the calendar surface, and a
-- constraint is the only way to guarantee nobody stores #ffff00 and makes a cell
-- unreadable. Restyling the palette later is then a code change, not a data
-- migration.

alter table rounds
  add column colour text not null default 'terracotta'
  check (colour in ('terracotta', 'blue', 'green', 'violet', 'gold', 'magenta'));

comment on column rounds.colour is
  'Palette key rendered as the left edge stripe on schedule calendar cells. See apps/admin/src/lib/round-colours.ts for the key-to-hex mapping.';

-- Existing rounds fan out across the palette rather than all landing on the
-- default, so an admin opening the calendar after this migration sees the feature
-- working rather than one flat colour.
with ordered as (
  select id, row_number() over (order by phase_code, round_code) - 1 as n
  from rounds
)
update rounds r
set colour = (array['terracotta', 'blue', 'green', 'violet', 'gold', 'magenta'])[(o.n % 6) + 1]
from ordered o
where o.id = r.id;
