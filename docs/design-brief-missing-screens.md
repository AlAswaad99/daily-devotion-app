# Design brief — Abide v2: missing screens & revisions

Paste everything below the line into a design session working on
`project/Abide-v2.dc.html`.

---

## Task

Extend `project/Abide-v2.dc.html` with **8 new screens, 4 new screen states, and 2
revisions to existing screens**. It is a live interactive prototype — an ~887-line
class component with `state`/`setState`, a bilingual `LIB` dictionary, a `SERIES`
dataset, working filters and a running timer. Screens are `sc-if` blocks keyed off
booleans derived from `s.tab`. New screens join that machine; they are not static
boards.

**Work on a branch.** Do not modify the six approved screens — Today, Streak,
Devotion Detail, Bible, Devotions Library, Series Detail — except for the two
revisions named in §4. Their layout, palette and copy are approved and signed off.

---

## 1. Authority

Visual language comes from `Abide-v2.dc.html`. Structure and behaviour come from
`docs/SPEC.txt`. Where they conflict, that split decides it — the spec's own
"this spec wins" clause applies to structure only, not to the look.

Consequence already applied: the app has **five** tabs, not the design's four.

## 2. Non-negotiable tokens

Reuse the existing values; do not introduce new hues.

**Surfaces — the rule is semantic, not a theme mode.** Ambient/ritual screens are
dark; reading screens are light. There is no dark-mode toggle in v1.

| | |
|---|---|
| Dark, streak-family | `radial-gradient(120% 70% at 50% 0%,#22300F 0%,#141D09 55%,#0A1005 100%)` |
| Dark, focus-family | `radial-gradient(120% 70% at 50% 18%,#2C3A14 0%,#18220A 55%,#070C03 100%)` |
| Light, standard | `linear-gradient(180deg,#F2F3E2 0%,#E9EDD4 100%)` |
| Light, reader | `linear-gradient(180deg,#F3F4E4 0%,#EAEEDB 100%)` |
| Card on dark | `rgba(13,18,7,.92)`, radius 26, inset ring `rgba(255,255,255,.07)` |
| Bottom nav | `rgba(11,15,4,.86)`, `blur(16px)`, radius `26 26 0 0`, height 88 |

**Accent** — lime `#A9C86A` · mid `#8FB052` · deep `#5E7E33` · pale `#D9E8A8`
**CTA** — `linear-gradient(160deg,#D9E8A8,#8FB052 72%,#6F9440)`, ink `#16200C`
**Nav active chip** — `linear-gradient(160deg,#D9E8A8,#8FB052 60%,#5E7E33)`

**Ink on dark** — `#F3F5E4` primary · `#A9B586` secondary · `#8D9A6F` label · `#77835A` tertiary
**Ink on light** — `#1F2612` primary · `#2C3318` heading · `#75844A` secondary · `#93A17A` muted · `#DDE3C4` line

**Flame** `linear-gradient(160deg,#F6BC45,#E8843C 55%,#C05A16)`, core `#FBE8B8`
**Mascot** `linear-gradient(155deg,#A0331F,#C6452A 40%,#8E2A18)`, features `#2A160A`

**Radii** — card 26 · CTA 16 · icon tile 15 · nav chip 14 · pill 30
**Frame** — 392 × 846 content area

## 3. Type

Keep the existing language-switched roles exactly as defined:

```
fUI      am → 'Niyala','Archivo'                                    en → 'Archivo', system-ui
fLabel   am → 'Nokia Ethiopic Bold','Nokia Bold','Niyala'           en → 'Archivo'
fSub     am → 'Nokia Ethiopic Light','NokiaPure Light','Niyala'     en → 'Archivo'
fItalic  am → 'Menbere','Niyala'                                    en → 'Newsreader'
```

**Every string is bilingual.** Add both `en` and `am` entries to `LIB` for all new
copy. No screen may contain a hardcoded literal. Amharic is the tight case for
width — lay out to Amharic first and let English have the slack.

**Fixed tab vocabulary** — use these exact words, they are decided:

| Tab | English | Amharic |
|---|---|---|
| Today | Today | ዛሬ |
| Devotions | Devotions | ጥሞና |
| Bible | Bible | መጽሐፍ |
| Focus | Focus | ጸሎት |
| Reflect | Reflect | ማስታወሻ |

`ጸሎት` (prayer), not `ትኩረት` — the spec defines Focus as prayer-only, separate from
study, and the label should name the purpose rather than the mechanic.

---

## 4. The two revisions

### R1 — Bottom nav: four tabs become five

Current `tabDef` is hardcoded to four. Rebuild for five, in this order:

**Today · Devotions · Bible · Focus · Reflect**

Reflect needs an icon consistent with the existing set. `tabReflect` already exists
in `LIB` — reuse the key, but change its Amharic value to `ማስታወሻ`.

**This is the real question the revision exists to answer.** `SPEC.txt:476` records
five tabs at 392 px as ~78 px each, "workable, but Amharic labels are the tight
case," and asks to see it rendered before committing. It has never been rendered.
So: render the nav in Amharic at five tabs and make the result obvious. If the
labels collide or truncate, the spec's pre-authorised fallback is to move **Bible**
out of the tab bar and reach it from the devotion detail and Reflect instead —
render that four-tab variant as a second option so the choice can be made on sight.

### R2 — Streak calendar: Gregorian becomes Ethiopian

The grid currently renders a Gregorian month (`ሴፍቴምበር 2026`). It must render the
Ethiopian calendar.

- **Real Ethiopian month names** — መስከረም, ጥቅምት, ኅዳር, ታኅሣሥ, ጥር, የካቲት, መጋቢት,
  ሚያዝያ, ግንቦት, ሰኔ, ሐምሌ, ነሐሴ, ጳጉሜ. Not transliterated Gregorian names.
  Source these from `kenat`'s `monthNames` so the design and
  `packages/domain/src/ethiopic.ts` cannot drift.
- **Arabic numerals** for year and day cells, not Ge'ez. This is already decided in
  code (`ethiopic.ts`: *"Arabic numerals throughout, by decision"*).
- **Pagume** is month 13 with 5 or 6 days — a short partial row, visually distinct
  from a truncated month.
- Preserve the existing day-cell state colours (counted / repaired / backfilled /
  missed / future / pre-join). Pre-join days stay neutral grey.

**Render two grid options and let the reviewer choose:**

- **(a) Weekday-aligned, 7 columns.** Months are 30 days but the week is still 7,
  so the first row stays ragged exactly as in a Gregorian month. Familiar; weekends
  are locatable.
- **(b) Regular 6 × 5 block, 30 cells, no weekday alignment.** Perfectly even,
  visually calmer, truer to a uniform 30-day month — at the cost of not being able
  to see which day is Sunday.

Do not pick one. Show both.

---

## 5. The eight new screens

Surface assignment follows the semantic rule in §2 and is already decided.

### Dark

**1. Onboarding — Welcome.** First run. The mascot is the hero here; this is the
one place it should be doing the most work. No account state yet.

**2. Onboarding — Join code.** Single code entry. The code binds the user to a
church *and* a ministry. Needs an invalid-code error state. There is no guest
browsing and no skip — a user without a code cannot proceed, and the screen should
not imply otherwise.

**3. Onboarding — Preferences.** One board covering three settings that share a
card-list shape: UI language, part of day, notification permission. Part of day
sets the default reminder time, so show the derived time rather than hiding it.

**4. Sign-in.** Returning user. Sits alongside onboarding, not inside it.

**5. Coming soon.** The round is finished and the next is not published yet.
Critically: **the streak is held, not broken** — the screen must say so, because a
user seeing an empty Today will otherwise assume they lost it. Offers past rounds
and the Bible reader as the two ways onward.

### Light

**6. Summary day.** End-of-book questions presented as its own devotion day. 3–4
questions, **each with its own reflection field**. Counts toward the streak. Shape
it as a sibling of Devotion Detail, not a new pattern.

**7. Reflect.** Every reflection the user has written, newest first. Search across
reflection text. Each entry opens its parent devotion. Private — no share affordance
and no export control anywhere on this screen in v1; drawing one would misrepresent
the privacy model, which is enforced at the database.

**8. Settings.** Languages, reminder time, per-notification toggles, account.
**UI language and reader language are set separately** — two controls, not one, and
the distinction needs to be legible. Must include a data-deletion path; it is an
app-store requirement, not a nicety.

---

## 6. The four new states

States, not new boards — add them to the props panel alongside the existing
`streakState` / `timeOfDay` / `mascotMove` so they can be toggled in review.

1. **Reflect — empty.** No reflections yet. The most likely state for a new user
   and the one most likely to look broken.
2. **Today — already done.** Today's devotion complete. Today currently only
   renders the not-yet-done case.
3. **Streak — repair offer.** Surfaces on the Streak screen when the user is
   eligible to repair a broken streak.
4. **Devotions library — no results.** Filters or search matched nothing. Distinct
   from "no devotions exist."

---

## 7. Acceptance

- The six approved screens render **byte-identically** apart from R1 and R2.
- Every new string has an `en` and an `am` entry in `LIB`; no hardcoded literals.
- The prototype still clicks through: five tabs reachable, new screens reachable
  from somewhere real, nothing orphaned.
- All four new states toggle from the props panel.
- Amharic five-tab nav rendered at true 392 px, with the four-tab fallback beside it.
- Both streak-grid options rendered.
- No new colours outside §2 and no new type families outside §3.
