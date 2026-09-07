# Abide v3 — re-audit after Waves 1–3

Re-performed 2026-09-08 against the current implementation on `v3-design-adoption`,
after implementing `CONFORMANCE_PLAN.md`'s three waves. Same methodology as
`PAGE_AUDIT.md`: design-conformance % = matching checkpoints ÷ audited checkpoints,
excluding the accepted product decisions listed there.

## Two of your own edits are folded in as accepted, not as findings

Per your note, two manual changes are kept and excluded from scoring in both
directions — not penalized, and not claimed as fixes:

- **The streak repair card is removed** (`app/streak.tsx`, commented out). The design
  has no repair mechanic at all, so this card was never a design-conformance
  checkpoint — its presence or absence doesn't move the percentage. It does lower the
  streak screens' *pixel*-diff numbers below, simply because there's less on-screen
  content that isn't in the reference to begin with.
- **Today's date line now includes the day of month** (`app/(tabs)/index.tsx`:
  `"FRIDAY · NEHASE 29 2018"` instead of `"FRIDAY · NEHASE 2018"`). The design's own
  line has no day number (`"FRIDAY · SEP 2026"`), so this is a deliberate departure
  from the reference. It's excluded from the conformance score; it does add a few
  points to Today's *pixel*-diff, which is noted below so the number isn't mistaken
  for a regression.

## Important: this pass corrected six inaccuracies in the original audit

Before touching code for Wave 3, I re-checked every remaining plan item against the
actual design source (`Abide v3.dc.html`) and the actual current code, rather than
trust my own earlier notes. Six of the ten Wave 3 items, plus two of Wave 2's four,
turned out to already be correct — the original `PAGE_AUDIT.md` findings behind them
were wrong, not the implementation:

| finding | what I claimed | what's actually true |
|---|---|---|
| Reader cross-ref chips | "carries both a fill and the shared 1px border" | `refChip` is a bespoke style with no border at all — already fill-only |
| Today's ink card | "design paints a radial gradient on it specifically" | design source: `background:rgba(13,18,7,.92)` — flat, exactly what's implemented |
| Onboarding code hint | "takes `lineHeightFor`'s 1.5× instead of the design's tighter leading" | no `lineHeight` is set on that style at all — already uses default leading |
| Focus preset pills | "filled circle / solid green" | current styles match the design's `padding:9px 18px;border-radius:30px;border:1px solid rgba(169,200,106,.4)` and per-state bg/fg exactly |
| Devotions custom-range fields | needed restyling to match the design's date input | current styles already match `border:1px solid #dde3c4;border-radius:12px;padding:9px 11px;font-size:13px;background:#fff` exactly |
| Reader save row | "single line under the field" | already the design's two-column row: note on the left, pill button on the right, same colours and radius |
| Reflect date tag | "design uses radius 8, not the pill 20" | design source: `border-radius:20px` — the app's pill radius was already correct |
| Flame button per-state | "opacity layered on top of nothing" | already layers the design's exact `op` values (0.7/0.5) on top of `Flame`'s own desaturated per-state palette, which is the only way to approximate a CSS `filter` in React Native |

None of these were touched — there was nothing to fix. I'm listing them so the
percentage change below isn't read as eight things I silently declared "good enough";
they were re-verified against the primary source and are exact matches.

One item was deliberately **not** changed after verification: Welcome's language pill
uses `insets.top + 10` rather than a hardcoded `top: 54`. In audit mode (which forces
`insets.top = 44`) these are numerically identical, so the change would move zero
pixels in any capture — but on a real device with a different safe-area inset, a
hardcoded 54 would be *less* correct, not more. Left as-is.

## What Wave 1–3 actually changed

| item | file(s) | real fix? |
|---|---|---|
| Settings text nodes → shared primitives | `app/settings.tsx`, `DevotionTime.tsx` | yes |
| Notification card row layout + gradient icon + arrow | `NotificationPreview.tsx`, `Chrome.tsx`, `Backdrop.tsx`, `theme.ts` | yes |
| English scripture bundled | `bible.db` (build only, gitignored) | yes — infra, not app code |
| Series summary's own header | `app/day/[id].tsx`, `SummaryQuestions.tsx` | yes |
| Series card icon stroke width | `app/(tabs)/devotions.tsx` | yes |
| Celebration backdrop light position | `app/series/[id]/complete.tsx` | yes |
| Settings' two language sections → one | `app/settings.tsx` | yes |
| Time-card selection ring (layout-neutral) + eased scale | `DevotionTime.tsx` | yes |
| Chip fill variant, InkCard radial ground | — | **not needed** (findings retracted) |

## Per-page conformance, before → after

Pages with no code change this pass keep their `PAGE_AUDIT.md` number unchanged —
nothing about them could have moved.

| page | before | after | why |
|---|---|---|---|
| Welcome | 92% | 92% | pill position deliberately left dynamic (see above) |
| Onboarding · code | 90% | **100%** | the one outstanding item was a false finding |
| Onboarding · name & time | 83% | **100%** | ring and scale-transition both fixed |
| Onboarding · notifications | 50% | **100%** | all three findings were real; all three fixed |
| Today | 89% | 89% | untouched this pass |
| Devotions (library) | 88% | **100%** | icon stroke fixed; range-field finding was false |
| Bible | 82% | 82% | untouched this pass |
| Focus | 78% | **93%** | preset-pill finding was false; `glowPulse` remains an accepted platform limit |
| Reader (devotion) | 80% | **95%** | English scripture now bundled; save-row and chip findings were false |
| Series detail | 86% | 86% | untouched this pass |
| Series summary | 85% | **100%** | its own header now renders instead of the reader's |
| Series complete | 91% | **100%** | backdrop family corrected |
| Streak | 86% | 86% | unchanged — the repair card was never a scored checkpoint either way |
| Settings | 79% | **93%** | text primitives and the language-section merge |
| Reflect (markup only) | ~80% | **90%** | date-tag radius finding was false |
| Sign-in | not scored | not scored | no design reference exists |

**Unweighted average across the 15 scored pages: 93.7%**, up from 83%.

## Pixel-diff, for the record

Same 39-screen set (excluding the two unbuilt reminder-signal variants), same masked
comparison as every prior pass:

| | P2-era baseline | after Wave 1 | after Wave 3 (now) |
|---|---|---|---|
| median | 16.3% | 17.55% | **16.36%** |
| mean | 18.2% | 19.2% | **18.7%** |
| best | 3.53% (`onboarding/02`) | 3.53% | 3.53% |
| worst | 41.9% (`core/13`) | 47.31% (`core/11`) | 47.31% (`core/11`) |

The dip after Wave 1 and the recovery here were both explained at the time: two reader
screens (`core/11`, `core/13`) picked up real ministry content (a key verse a specific
day didn't carry before) between capture sessions, unrelated to any code change. That
noise is still present in the "after Wave 3" column — it's a moving target, not
something a fix can close.

**Two screens carry expected extra pixel-diff from your accepted edits**, not from any
regression:

- `today-states/*` and `core/01` — a few points each, from the date line now including
  a day number the design's own line doesn't have.
- `streak/*` — these actually *improved* (streak/03 12.3% vs 17.7–18.5% earlier,
  streak/06 10.7% vs 16.2–16.8%), because the repair card's removal took an
  entire ink card the reference never had off the screen.

## What's still outstanding

Everything left is either a platform limit already documented as accepted (Bible
verse-number superscript, Focus's `glowPulse`, the twirl's mirrored far half), an
app-original feature with no design counterpart (Focus's DND/history cards, the
streak's now-removed repair card, the series summary's locked state, the Bible
picker), or a page this pass didn't touch because nothing in it changed (Today, Bible,
Series detail, Streak's own layout). None of the ten items originally on the Wave 3
list are still open.
