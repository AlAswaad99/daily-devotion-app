# Abide v3 — per-page design conformance

Audited 2026-09-07 against the current implementation on `v3-design-adoption`
(commit not yet made) and the design's own markup/CSS in `Abide v3.dc.html`,
`DayScene.dc.html` and `Reminder Signals.dc.html`. Findings below were re-checked
against the current source for this report — where an earlier session claimed
something was "resolved," it was re-read here rather than taken on trust, and two
places where that turned up a real gap are marked as such.

## Method

**Conformance %** = (design checkpoints that match) ÷ (design checkpoints
audited for that page), where a checkpoint is a distinct thing the design specifies —
a colour, a size, a spacing value, a component's anatomy, a copy string, a motion
curve. It is a spec-conformance score, not a screenshot-similarity score: a page can
score high here and still look different in a pixel diff, because real ministry
content (Ruth, Psalms) is longer or shorter than the design's placeholder content
(John, Judges) and reflows the page — that is not counted against it.

**Priority** — P0 wrong content/state or a structurally different component; P1 a
clearly visible deviation (wrong colour, family, size, or missing element); P2 a
sub-4px or cosmetic difference.

**Complexity** — effort to close the gap. Low: a style-value change, under an hour.
Medium: new layout or a new sub-component, 1–3 hours. High: new capability or a
platform workaround, 3h+.

**Accepted decisions are excluded**, per your instruction — they are not compared
against the design at all, in either direction. Listed once, not repeated per page:

- No "I don't have a code" path (join code is required for RLS to work)
- Sign-in screen (no design exists for it; excluded below rather than scored)
- Five tabs, in the app's order (Today · Devotions · Bible · Focus · Reflect)
- Five streak cell states (counted/repaired/backfilled/missed/pre-join) instead of three
- kenat for the Ethiopian calendar instead of the prototype's own JDN functions
- Ministry-authored summary questions (3–4 per book) instead of four fixed ones
- Streak calendar grid variant *a* (weekday-aligned) instead of variant *b*
- Lantern reminder signal instead of glow or ribbon
- Repair credits / offline handling on the streak screen (app-only feature)

---

## Welcome

**92% conforms** (11/12 checkpoints)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | Language pill padding is 8/13 vs the design's 8/13 top-right at `top:54,right:18`; app renders it at the safe-area top rather than a fixed 54px, so on tall/short devices it sits 0–6px off the design's fixed position | P2 | Low |

Everything else matches: wordmark tracking (-1), mascot drop shadow, tagline max-width
(260), CTA glow, and the footer's vertical position (the removed "I don't have a code"
link's space is deliberately kept, per the accepted decision above, so the button lands
where the design's does).

---

## Onboarding — Enter your code

**90% conforms** (9/10)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | Hint text line-height is derived from `lineHeightFor` (1.5×) rather than the design's tighter default leading; visually under 1px at this size | P2 | Low |

Resolved since the last pass: the active box now follows the next-character index
rather than input focus (matches the design, which highlights the box regardless of
keyboard focus), the filled-but-incomplete box colour is `#b9c49a`, and the accepted
row is full-width with the gradient tick and a rise-fade entrance.

---

## Onboarding — Name & devotion time

**83% conforms** (10/12)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The selected time card's border is 2.5px vs the unselected 1px, so the selected card's box is ~3px taller than its neighbour in the row — the design's ring is a non-layout-affecting `box-shadow`, so neighbouring cards stay the same height whichever is selected | P2 | Low |
| 2 | Selection scale (`1.02`) is applied instantly with no transition; the design eases it in over 0.2s with a slight overshoot | P2 | Low |

Resolved: the DayScene art renders inside each card with the period word in the time
label, the fine-tune panel's row labels are Archivo Bold at 12.5px in `#5b6647`
(matches), stepper values are Anton, and the summary row uses the clock icon with
Archivo ExtraBold for the value — all per the design's spec, even though the app's own
redrawn sky art does not pixel-match the original SVG's exact cloud/sun positions
(a redraw choice, not a spec deviation).

---

## Onboarding — Notifications

**50% conforms** (3/6) — the lowest-scoring onboarding screen, and worth flagging

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | **The notification-preview card is still a column layout** (icon + "Abide · now" on one row, then the greeting, then the body, stacked). The design is a row: a 38×38 icon on the left, a text column on the right with "Abide · now" set apart on one line and the greeting/body below it. This was flagged in the first audit and never actually rebuilt — it was mis-marked as done in an earlier summary this session | P1 | Medium |
| 2 | The icon's background is a flat `theme.color.inkDeep`, not the design's mascot-red gradient (`linear-gradient(155deg,#A0331F,#C6452A 60%,#8E2A18)`) with the character's face peeking from the bottom | P1 | Medium |
| 3 | The "Allow reminders" button shows a trailing arrow; the design's markup for this one button has no arrow span (every other onboarding CTA does) | P2 | Low |

Resolved: body copy, the ink panel's radius and padding, the kicker line under the
card, and the "Not now" link.

---

## Sign-in

**No design reference — not scored.** The design has no frame for authentication at
all; it assumes a join code is the whole of joining. The screen is dressed in the
onboarding chrome (paper ground, ink language pill, kicker, title, fields, the shared
button) so it is not visually orphaned in the flow, but there is nothing to conform
*to*, so no percentage is meaningful here.

---

## Today

**89% conforms** (16/18)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The small flame button dims by flat opacity (0.7 low / 0.5 out) layered on top of the palette's own colour shift; the design applies `grayscale()`/`brightness()` filters, which React Native has no direct equivalent for on non-image content | P2 | Low |
| 2 | The ink devotion card's shadow lift and the ink card's own gradient stops are the shared `InkCard` token, not the exact `radial-gradient(120% 90% at 50% 0%,#2c3a16,#131a0a)` the design paints specifically on this card (it uses a flat `rgba(13,18,7,.92)` fill) | P2 | Low |

Resolved: DayScene sky per part of day, the flame and gear in their design positions,
the rotating greeting + Ethiopian date line + motivation line, the 150px mascot with
correct mood-to-face mapping (strong+unread now shows the smile the design specifies,
not the neutral mouth an earlier mapping gave it), the lantern signal with
`begunToday`, and the floating nav.

---

## Devotions (library)

**88% conforms** (14/16)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | Custom date range is two typed `YYYY-MM-DD` fields rather than the design's native `<input type="date">` picker — a reasonable substitution (no native-date-picker dependency existed), but it is a different control, not the same one restyled | P2 | Medium |
| 2 | Series card's icon tile background is `rgba(94,126,51,.13)` flat; the design's is the same colour but the icon itself is a book glyph at 22px stroke-1.9 vs the design's stroke-2 — a hairline difference | P2 | Low |

Resolved: search field with icon and clear button, status and range chip rows, series
card anatomy (icon tile, badge, title, arrow, gradient progress bar, percentage, meta),
and the flat result row's number chip / pills / star.

---

## Bible

**82% conforms** (14/17)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | Verse numbers sit on the text baseline, not raised — the design sets `vertical-align:6px`, which has no React Native equivalent (no inline superscript) | P2 | Low (accept) / High (to truly fix) |
| 2 | Chapter picker uses horizontally scrolling chip rows for the book and chapter lists; the design doesn't specify a picker UI at all (it has no book/chapter switcher in the reference), so this is app-original UI dressed in the design's chip tokens rather than something to conform to a spec | — | — |
| 3 | The bottom nav now correctly hides on scroll-down (moved from this screen's own header, which is the fix from the previous pass) — resolved, listed here only because it was the single biggest structural gap and is worth confirming closed | — | — |

Resolved: paper gradient ground, the sticky header (kicker, Newsreader 34 title, ‹ ›
circles), and scripture set as prose at 18.5/1.66 with the verse number in Archivo
ExtraBold lime set into the first line.

---

## Focus

**78% conforms** (11/14)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The Anton timer has no `glowPulse` (a `drop-shadow` animation on the gradient-filled text); React Native cannot animate a shadow on masked/gradient text the way CSS can | P2 | High |
| 2 | The ✕ close button and the DND/history cards are app-original — the design has no equivalent screen states for "restored," "last 30 days," or a close affordance separate from the tab bar, so these are outside the design's spec rather than a deviation from it | — | — |
| 3 | Preset pill copy is "5 min / 15 min / 25 min" (matches), but the pill shape is a filled circle at rest / solid green when selected rather than the design's outlined pill with a translucent green fill when selected | P2 | Low |

Resolved: the ink backdrop, the centred Anton-138-equivalent gradient timer, the
progress bar, and play/reset controls sized and positioned per the design.

---

## Reader (devotion detail)

**80% conforms** (16/20)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The key-verse card renders real scripture text (a deliberate improvement over refs-only), but only Amharic is bundled — an English-language member sees Amharic verse text under an English UI, which the design never anticipated either way | P1 | High (blocked on licensing, not code) |
| 2 | The Save/autosave note area is a single line under the field rather than the design's row with a checkmark note on the left and a pill button on the right when there is something to save | P2 | Low |
| 3 | Cross-reference chips use the shared `Chip`/pill token; the design's own reference chips are a slightly different shape (`rgba(94,126,51,.13)` fill, no border) — the app's chip has both a fill and the shared 1px border | P2 | Low |
| 4 | The reflection question is the app's own generic prompt ("What is God saying to you in this passage?") since the content pipeline has no per-day reflection question column; the design shows no such field on the reader either, so this is new UI rather than a deviation | — | — |

Resolved: sticky header with kicker/star, ref → title → meta order, the ink key-verse
card with its radial gradient, the "Read the full chapter" bar seamed to it, and body
type at 17.5/1.62.

---

## Series detail (book)

**86% conforms** (12/14)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The summary card's locked state (shown when parts remain) is an app addition with no design counterpart — the design only draws the unlocked card. Its colours (`theme.color.panel` fill, muted chip) are a reasonable extrapolation from the unlocked state's tokens rather than a specified design | — | — |
| 2 | Row anatomy for each part reuses the library's `DayRow`, which is correct, but the series-only variant omits the "series ·" prefix in the sub-line (correctly, since it would repeat the page's own title) — no design row exists at the series level to check this against directly, so it is extrapolated from the library row | P2 | Low |

Resolved: header with back + "SERIES" kicker, 36px title, progress meta + percentage,
and the gradient bar.

---

## Series summary (uses the reader template, `kind: "summary"`)

**85% conforms** (11/13)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | Header uses the reader's ref/title/meta stack (eyebrow date, then the series title in the title slot) rather than a dedicated "SERIES SUMMARY" kicker + series-name title + lede that the design draws for this screen specifically | P1 | Medium |
| 2 | Progress text colour/size is the shared `Kicker` default rather than the design's 11.5px/800 lime | P2 | Low |

Resolved: question cards at 20px radius with 28px chips, borderless inset textareas,
and the "Finish series" primary button.

---

## Series complete (celebration)

**91% conforms** (10/11)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | Backdrop uses the `focus` ink variant (light at 18% from the top) rather than the `welcome`/celebration family's 20% — a 2-percentage-point difference in where the radial's light sits, essentially invisible at this screen size | P2 | Low |

Resolved: five confetti pieces at the design's positions/sizes/shapes with the
`floatY` drift and stagger, mascot at 110px with the `mDouble` two-hop loop, and the
tile/kicker copy and spacing.

---

## Streak

**86% conforms** (12/14)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The repair-offer card (amber, with the repair-credit button) is an app feature with no design counterpart — the design's streak screen has no repair mechanic at all, so its styling is extrapolated from the design's amber/flame token family rather than specified | — | — |
| 2 | Calendar day-number colours by state (`numberColour`) approximate the design's four cases (today/read/missed/other) but use `theme.color.missedSoft` for missed days rather than the design's `#c98a6a`, which are the same colour under a different name — a naming/lookup detail, not a visible gap | — | — |

Resolved: the drawn flame with its three states (colour, scale, flicker, smoke), the
92px Anton count with state colour, the "DAY STREAK / BEST STREAK / DEVOTIONS" labels
and the streak message/sub-line from `STREAK_COPY`, and the weekday-aligned calendar
with its header and footer copy.

---

## Settings

**79% conforms** (11/14)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | **Not every text node on this screen goes through the shared text primitives.** `rowTitle`, `restartText`, `version`, and the account-row chevrons are raw `<Text>` elements with a manually set `fontFamily` but no explicit `lineHeight` and no `includeFontPadding:false` — the fix that was applied to `Kicker`/`UiText`/`Title` does not reach them. This is the specific, verified cause of the screen's remaining ~8px vertical drift per section: some rows measure to the font's default metrics and some don't, in the same list | P1 | Medium |
| 2 | The two language-card rows (App language / Scripture language) are stacked as two separate card+kicker pairs; the design draws one "LANGUAGE" section with a single row of two cards — the second row (scripture language) is an app-only addition since `reader_language` is a separate column the design doesn't know about, so its presence is not a deviation, but its being a *second full section* rather than a second row under one kicker is | P2 | Low |

Resolved: section spacing, card radius, the reminder row and its toggle, the
devotion-time block (inherits the Name+Time findings above), and the restart-onboarding
footer link.

---

## Reflect (journal)

**No screenshot reference exists**, so this is checked against the design's own
markup (`isReflect` block in `Abide v3.dc.html`) rather than a rendered frame — treat
the percentage below as lower-confidence than the others, since a markup read can miss
things a screenshot would show.

**~80% conforms** (8/10, against the markup)

| # | Difference | Priority | Complexity |
|---|---|---|---|
| 1 | The date tag on each card reads the amber colour pair correctly but at a smaller type size (9px vs the design's implied ~9px — close) with a pill radius rather than the design's `border-radius:8px` rounded-rect | P2 | Low |
| 2 | No empty-state illustration; the design specifies only copy for the empty state ("Your saved reflections will appear here."), which the app matches — listed here only to confirm there is nothing else expected | — | — |

Resolved (against the markup): search field, series chips, the shared range-chip row
including "Custom range," and card anatomy (title, clamped body, date tag).

---

## Summary across all scored pages

| page | conformance |
|---|---|
| Welcome | 92% |
| Onboarding · code | 90% |
| Onboarding · name & time | 83% |
| Onboarding · notifications | **50%** |
| Today | 89% |
| Devotions (library) | 88% |
| Bible | 82% |
| Focus | 78% |
| Reader (devotion) | 80% |
| Series detail | 86% |
| Series summary | 85% |
| Series complete | 91% |
| Streak | 86% |
| Settings | 79% |
| Reflect (journal, markup-only) | ~80% |
| Sign-in | not scored — no design |

**Unweighted average across the 15 scored pages: 83%.**

## What to do first

Two items are worth doing before anything else on this list, because each is a single
concrete fix with an outsized effect:

1. **Settings — attach the missing text primitives** (P1, Medium). This is the one
   finding that explains a whole screen's residual layout drift rather than a cosmetic
   detail, and the fix is mechanical: swap four raw `<Text>` calls for `UiText`/`Kicker`
   or add `includeFontPadding:false` + an explicit `lineHeight` to their styles.
2. **Notifications preview card — rebuild as a row** (P1, Medium). This is the one
   screen below 70%, and it was already scoped and estimated in the original plan but
   never actually implemented in the pass that claimed it. `NotificationPreview.tsx`
   needs its layout restructured (row, not column) and its icon background swapped for
   the mascot gradient.

Everything else on the list is P2 and individually small; most are style-value changes
under an hour each.
