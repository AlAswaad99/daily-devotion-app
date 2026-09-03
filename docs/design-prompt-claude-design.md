# Paste-ready prompt for Claude Design

Open the existing **Abide v2** canvas in Claude Design, then paste everything below.

---

Extend this prototype with 8 new screens, 4 new screen states, and 2 revisions to
existing screens.

This is a live interactive prototype, not a set of static boards — screens are
`sc-if` blocks keyed off `s.tab`, with a bilingual `LIB` dictionary, a `SERIES`
dataset, working filters and a running timer. New screens join that state machine
and must be reachable by clicking.

**Do not modify the six approved screens** — Today, Streak, Devotion Detail, Bible,
Devotions Library, Series Detail — except for the two revisions in section 4. Their
layout, palette and copy are signed off.

## 1. Surface rule

Dark and light are semantic, not a theme mode. Ambient/ritual screens are dark;
reading screens are light. There is no dark-mode toggle. Every new screen's surface
is already assigned in section 5 — do not deviate.

## 2. Tokens — reuse these exactly, introduce no new hues

Dark, streak-family: `radial-gradient(120% 70% at 50% 0%,#22300F 0%,#141D09 55%,#0A1005 100%)`
Dark, focus-family: `radial-gradient(120% 70% at 50% 18%,#2C3A14 0%,#18220A 55%,#070C03 100%)`
Light, standard: `linear-gradient(180deg,#F2F3E2 0%,#E9EDD4 100%)`
Light, reader: `linear-gradient(180deg,#F3F4E4 0%,#EAEEDB 100%)`
Card on dark: `rgba(13,18,7,.92)`, radius 26, inset ring `rgba(255,255,255,.07)`
Bottom nav: `rgba(11,15,4,.86)`, `blur(16px)`, radius `26 26 0 0`, height 88

Accent: lime `#A9C86A` · mid `#8FB052` · deep `#5E7E33` · pale `#D9E8A8`
CTA: `linear-gradient(160deg,#D9E8A8,#8FB052 72%,#6F9440)`, ink `#16200C`
Nav active chip: `linear-gradient(160deg,#D9E8A8,#8FB052 60%,#5E7E33)`

Ink on dark: `#F3F5E4` primary · `#A9B586` secondary · `#8D9A6F` label · `#77835A` tertiary
Ink on light: `#1F2612` primary · `#2C3318` heading · `#75844A` secondary · `#93A17A` muted · `#DDE3C4` line

Flame: `linear-gradient(160deg,#F6BC45,#E8843C 55%,#C05A16)`, core `#FBE8B8`
Mascot: `linear-gradient(155deg,#A0331F,#C6452A 40%,#8E2A18)`, features `#2A160A`

Radii: card 26 · CTA 16 · icon tile 15 · nav chip 14 · pill 30
Frame: 392 × 846 content area

## 3. Type — keep the existing language-switched roles

```
fUI      am → 'Niyala','Archivo'                                 en → 'Archivo', system-ui
fLabel   am → 'Nokia Ethiopic Bold','Nokia Bold','Niyala'        en → 'Archivo'
fSub     am → 'Nokia Ethiopic Light','NokiaPure Light','Niyala'  en → 'Archivo'
fItalic  am → 'Menbere','Niyala'                                 en → 'Newsreader'
```

Every string is bilingual — add both `en` and `am` entries to `LIB` for all new
copy. No hardcoded literals anywhere. Amharic is the width-critical case: lay out to
Amharic first and let English take the slack.

Tab vocabulary, fixed:

| Tab | English | Amharic |
|---|---|---|
| Today | Today | ዛሬ |
| Devotions | Devotions | ጥሞና |
| Bible | Bible | መጽሐፍ |
| Focus | Focus | ጸሎት |
| Reflect | Reflect | ማስታወሻ |

Use `ጸሎት` for Focus, not `ትኩረት` — the feature is prayer-only and separate from
study, so the label names the purpose, not the mechanic.

## 4. Two revisions

### R1 — Bottom nav: four tabs to five

`tabDef` is currently hardcoded to four. Rebuild for five in this order:

**Today · Devotions · Bible · Focus · Reflect**

Reflect needs an icon consistent with the existing set. A `tabReflect` key already
exists in `LIB` — reuse it, but change its Amharic value to `ማስታወሻ`.

The point of this revision is to answer an open question by rendering it. Five tabs
at 392 px is roughly 78 px each; the Amharic labels are the tight case and have
never actually been drawn. Render the nav **in Amharic, at true 392 px**, and make
collision or truncation obvious. Then render a **second four-tab variant with Bible
removed** from the bar as the fallback. Present both; do not pick.

### R2 — Streak calendar: Gregorian to Ethiopian

The grid currently renders a Gregorian month (`ሴፍቴምበር 2026`). Replace with the
Ethiopian calendar.

Month names — use these exact strings, not transliterated Gregorian names:

```
1  መስከረም     5  ጥር        9  ግንቦት
2  ጥቅምት      6  የካቲት     10  ሰኔ
3  ኅዳር       7  መጋቢት     11  ሐምሌ
4  ታኅሣሥ      8  ሚያዝያ     12  ነሐሴ
                            13  ጳጉሜ
```

English: Meskerem, Tikimt, Hidar, Tahsas, Tir, Yekatit, Megabit, Miazia, Ginbot,
Sene, Hamle, Nehase, Pagume.

Weekday headers: እሁድ ሰኞ ማክሰኞ ረቡዕ ሐሙስ ዓርብ ቅዳሜ (short forms እ ሰ ማ ረ ሐ ዓ ቅ).

- **Arabic numerals** for year and day cells. Not Ge'ez numerals.
- Months 1–12 are exactly 30 days. **Pagume** is month 13 with 5 or 6 days — render
  it as a short partial row that reads as intentional, not as a truncated month.
- Preserve the existing day-cell state colours: counted, repaired, backfilled,
  missed, future, pre-join. Pre-join days stay neutral grey.

Render **two grid options** and present both — do not choose:

**(a) Weekday-aligned, 7 columns.** A 30-day month on a 7-day week still starts on
an arbitrary weekday, so the first row stays ragged exactly like a Gregorian month.
Familiar; weekends locatable.

**(b) Regular 6 × 5 block, 30 cells, no weekday alignment.** Perfectly even and
calmer, truer to a uniform 30-day month — but you lose which day is Sunday.

## 5. Eight new screens

### Dark surfaces

**1. Onboarding — Welcome.** First run. The mascot is the hero and should be doing
more work here than anywhere else in the app. No account state yet.

**2. Onboarding — Join code.** Single code entry. The code binds the user to both a
church and a ministry. Include an invalid-code error state. There is no guest
browsing and no skip — a user without a valid code cannot proceed, and nothing on
the screen should imply otherwise.

**3. Onboarding — Preferences.** One board covering three settings that share a
card-list shape: UI language, part of day, notification permission. Part of day sets
the default reminder time — show the derived time rather than hiding it.

**4. Sign-in.** Returning user. A sibling of onboarding, not a step inside it.

**5. Coming soon.** The current round is finished and the next is not published yet.
Critically: **the streak is held, not broken** — say so on the screen, because a user
landing on an empty Today will otherwise assume they lost it. Offer past rounds and
the Bible reader as the two ways onward.

### Light surfaces

**6. Summary day.** End-of-book questions presented as its own devotion day. 3–4
questions, **each with its own reflection field**. Counts toward the streak. Build it
as a sibling of Devotion Detail, not as a new pattern.

**7. Reflect.** Every reflection the user has written, newest first. Search across
reflection text. Each entry opens its parent devotion. It is private: **draw no share
affordance and no export control anywhere on this screen.** Privacy here is enforced
in the database, and a share button would misrepresent the product.

**8. Settings.** Languages, reminder time, per-notification toggles, account. **UI
language and reader language are separate settings** — two distinct controls, and the
difference must be legible at a glance. Include a data-deletion path; it is an
app-store requirement.

## 6. Four new states

These are states, not new boards. Add them to the props panel alongside the existing
`streakState` / `timeOfDay` / `mascotMove` so a reviewer can toggle them.

1. **Reflect — empty.** No reflections yet. The most common state for a new user and
   the one most likely to look broken.
2. **Today — already done.** Today's devotion complete. Today currently renders only
   the not-yet-done case.
3. **Streak — repair offer.** Shown on Streak when the user is eligible to repair a
   broken streak.
4. **Devotions library — no results.** Filters or search matched nothing. Visually
   distinct from "no devotions exist."

## 7. Acceptance

- The six approved screens are unchanged apart from R1 and R2.
- Every new string has both `en` and `am` entries in `LIB`; no hardcoded literals.
- The prototype still clicks through — five tabs reachable, every new screen
  reachable from somewhere real, nothing orphaned.
- All four new states toggle from the props panel.
- The Amharic five-tab nav is rendered at true 392 px, with the four-tab fallback
  beside it.
- Both streak-grid options are rendered.
- No colours outside section 2, no type families outside section 3.
