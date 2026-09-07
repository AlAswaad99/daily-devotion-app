# Conformance plan — closing the gaps in PAGE_AUDIT.md

Scope agreed: **the P1s plus every P2 that is a style-value or small-layout change.**
The three genuine platform limits are accepted and documented rather than worked around.

Target: the 15 scored pages move from an 83% average to roughly **95%**.
Estimated effort: **~14 hours**, in three waves.

## Ordering principle

Wave 1 is the four items that change what a member actually sees or can do. Wave 2 is
shared components — each edit closes findings on two or more pages at once, so they come
before the per-screen work that sits on top of them. Wave 3 is the per-screen remainder,
each independent and individually small.

Within a wave, order does not matter; nothing in Wave 3 depends on anything else in
Wave 3.

---

# Wave 1 — the four that matter (~6.75h)

## 1.1 Settings — route every text node through the shared primitives

**P1 · Medium · ~1.5h · `apps/mobile/app/settings.tsx`**

The verified cause of the screen's ~8px-per-section drift. Four text nodes are raw
`<Text>` with a hand-set `fontFamily` but no explicit `lineHeight` and no
`includeFontPadding: false`, so they measure to Android's font metrics while the
`Kicker`/`UiText` nodes beside them measure to their own line height. The rows disagree
inside the same list.

**Change**

| line | current | becomes |
|---|---|---|
| 176 | `<Text style={[styles.rowLabel, …]}>` | `<UiText language={language} size={14.5} colour={theme.color.inkSecondary}>` |
| 201, 270, 280 | `<Text style={[styles.rowTitle, …]}>` | `<UiText language={language} size={15} colour={theme.color.ink} strong>` |
| 298 | `<Text style={[styles.restartText, …]}>` | `<UiText language={language} size={12.5} colour={theme.color.accent} strong>` |
| 302 | `<Text style={[styles.version, …]}>` | `<UiText language={language} size={11} colour={theme.color.footnote}>` |
| 271, 283 | chevron `<Text style={styles.chevron}>` | keep as `<Text>`, add `includeFontPadding: false` and `lineHeight: 21` to `styles.chevron` |

Then delete `rowLabel`, `rowTitle`, `restartText` and `version` from the stylesheet —
their sizes and colours move into the call sites, which is where every other v3 screen
puts them.

**Watch for**: `UiText` at `strong` resolves to `fonts().label` (Archivo Bold); the
design sets `rowTitle` at 700, so `strong` is correct there and wrong for `rowLabel`,
which the design sets at 600 — that one takes the default (`uiMedium`).

**Verify**: re-measure card-top positions against `settings/01`. The first card should
land at ~173 rather than 181, and the inter-section gap should close from 48 to ~40.

---

## 1.2 Notification preview — rebuild as a row

**P1 · Medium · ~2h · `apps/mobile/src/components/onboarding/NotificationPreview.tsx`**

The one screen below 70%. Currently a column: icon and "Abide · now" on one row, then
the greeting, then the body. The design is a row — icon on the left, a text column on
the right — and the icon is the mascot's own red gradient with the character's face
peeking out of the bottom, not a flat ink square.

**Change**

Restructure the card body from three stacked children to two side-by-side:

```
card (row, gap 12, alignItems flex-start)
├── appIcon 38×38, radius 11, LinearGradient ['#A0331F','#C6452A','#8E2A18']
│   locations [0, 0.6, 1], start {x:0.15,y:0}, end {x:0.85,y:1}
│   └── Mascot size 26, aligned to the bottom edge (marginBottom −4) so the
│       face peeks rather than floating centred
└── column (flex 1)
    ├── row, justifyContent space-between:  "Abide"        "now"
    ├── greeting   14px / labelStrong / theme.color.ink
    └── body       13px / body / 1.35 / theme.color.inkBodySoft
```

The icon needs `overflow: 'hidden'` (already present) so the mascot clips at the tile's
rounded corner — that clipping is what makes it read as an app icon rather than a
sticker.

**Copy**: "Abide" and the timestamp are two separate `<Text>` nodes justified apart, not
one concatenated string — the design sets them at opposite ends of the line.

**Rides along (P2, +0.25h)**: thread an `arrow` prop through `OnboardingChrome` into
`PrimaryButton`, and pass `arrow={false}` on the notifications step. The design's markup
for that one button has no arrow span; every other onboarding CTA does.
Files: `src/components/onboarding/Chrome.tsx`, `app/onboarding.tsx` (~line 210).

**Also (P2, +0.1h)**: the ink panel behind the card uses `InkBackdrop variant="streak"`
(`#22300F → #0A1005`). The design paints `#2c3a16 → #131a0a`. Add a `notification`
variant to `Backdrop.tsx` or reuse `focus` — `focus` is the closer of the two.

---

## 1.3 English scripture — build it into the bundled database

**P1 · Medium · ~2h including verification · `scripts/build-bible.mjs` output**

*This one turned out smaller than the audit assumed.* The audit recorded it as "blocked
on licensing." It is not blocked on code or on data:

- `bibles/EnglishNIVBible.xml` (4.98 MB) is present in the repo.
- `reader_language` is **already** set to the UI language at signup —
  `redeem_join_code` passes `p_ui_language` into both columns
  (`supabase/migrations/20260903000200_devotion_window.sql`).
- Settings **already** has the scripture-language switcher writing `reader_language`.
- `bible.tsx` and `KeyVerseCard.tsx` **already** read `reader_language`.

The only missing thing is the text. The bundled `apps/mobile/assets/bible/bible.db`
(13.2 MB) contains one row in `translations`: the Amharic NASV. It was built with
`--only=nasv`.

**Change**

```bash
node scripts/build-bible.mjs --include-licensed
```

Then the switcher works, the Bible tab renders English, and the reader's key-verse card
shows English verse text under an English UI.

**The constraint to solve first.** The build script's own comment says the full build is
~18 MB and "reliably exceeds expo-asset's 60-second download timeout" when the emulator
fetches the asset over Metro. Amharic alone is already 13.2 MB, so both will land around
20–22 MB. Step one of this item is to build it and find out. If the emulator cannot load
it:

- **Option A** — keep `--only=` for day-to-day emulator work and verify English against
  a release build, where the asset is read locally and the timeout does not apply.
  Zero code change; costs a rebuild whenever you want to test the other language.
- **Option B** — trim the database. The build writes a `foldForSearch` column alongside
  every verse, which roughly doubles text storage. Making it a separate FTS table, or
  dropping it in favour of folding at query time, should take 30–40% off.
- **Option C** — one asset file per translation, loaded on demand by `reader_language`.
  Cleanest for both the timeout and the installed size, and only one loads at a time.
  Costs: `listTranslations()` currently powers the Settings picker by reading the open
  database, so it would need a static manifest instead of a query.

Recommendation: try the straight build, fall back to **A** for development, and treat
**C** as the answer if installed size becomes a release concern.

**Before you ship**: both texts are `distributable: false` — © Biblica. The gate is
already enforced in the build script and this change does not weaken it, but the shipped
APK would then carry two licensed texts rather than one. Unchanged in kind, doubled in
exposure.

**Verify**: `select code, language from translations` in the built db returns two rows;
Settings → Scripture language → English renders NIV in the Bible tab and in the reader's
key-verse card.

---

## 1.4 Series summary — its own header inside the reader

**P1 · Low–Medium · ~1h · `apps/mobile/app/day/[id].tsx`**

The summary day rides the reader template and inherits the reader's eyebrow/title/meta
stack. The design gives it a "SERIES SUMMARY" kicker, the series name as the title, and
a lede line.

**Change**: branch the header block on `isSummary` (the variable already exists at
line ~213):

- kicker → `t('summaryKicker')` (already in `i18n.ts`)
- title → the book title at 36 (already the case)
- drop the ref line and the reader's meta line
- add the lede: `t('summaryLede')` as `Body` 15.5 in `theme.color.inkSecondary`
- keep the star and back button

`SummaryQuestions` already renders the progress bar and cards below, so nothing else
moves. One route, one completion path, as agreed.

**Rides along (P2, +0.15h)**: the progress text inside `SummaryQuestions.tsx` is the
`Kicker` default; the design sets 11.5px/800 in lime. `styles.progressText` is already
`fontSize: 11.5, color: theme.color.accent` — it just needs `fontFamily: f.labelStrong`
at the call site.

---

# Wave 2 — shared components (~1.7h)

Each of these closes findings on more than one page.

## 2.1 `Chip` — a fill-only variant

**P2 · Low · ~0.5h · `src/components/ui.tsx`**

The reader's cross-reference chips carry both a fill and the shared 1px border; the
design's are fill-only (`rgba(94,126,51,.13)`, no border). Add a `variant?: 'outline' |
'fill'` prop defaulting to `outline`, and pass `fill` from `day/[id].tsx`.
Closes: Reader #3.

## 2.2 `InkCard` — an optional radial ground

**P2 · Low · ~1h · `src/components/ui.tsx`**

Today's devotion card uses the flat `rgba(13,18,7,.92)` fill; the design paints
`radial-gradient(120% 90% at 50% 0%, #2c3a16, #131a0a)` on it specifically. `KeyVerseCard`
already solves exactly this — measured layout, SVG radial, solid base underneath. Lift
that into `InkCard` behind a `ground?: 'flat' | 'radial'` prop and have `KeyVerseCard`
consume it rather than duplicating it.
Closes: Today #2, and removes a duplicate implementation.

## 2.3 `Icon` — stroke weight

**P2 · Trivial · ~0.1h · `app/(tabs)/devotions.tsx`**

The series card's book icon passes `strokeWidth={1.9}`; the design's set is stroke-2
throughout. Drop the override.
Closes: Devotions #2.

## 2.4 `Backdrop` — celebration light position

**P2 · Trivial · ~0.1h · `app/series/[id]/complete.tsx`**

Uses `variant="focus"` (light at 18%); the celebration belongs to the Welcome family
(20%). Change to `variant="welcome"`.
Closes: Series complete #1.

---

# Wave 3 — per-screen (~4h)

| # | Page | Change | File | Effort |
|---|---|---|---|---|
| 3.1 | Welcome | Pin the language pill to the design's fixed `top: 54, right: 18` rather than the safe-area top, so it lands identically across device insets | `app/welcome.tsx` | 0.3h |
| 3.2 | Onboarding · code | Hint text takes the tighter default leading instead of `lineHeightFor`'s 1.5× | `src/components/onboarding/CodeEntry.tsx` | 0.2h |
| 3.3 | Onboarding · name & time | Make the selection ring non-layout-affecting: move the 2.5px border onto an absolutely-positioned overlay inside `cardSlot`, or give the unselected slot a transparent 2.5px border so both states measure the same. Today the selected card's box is ~3px taller than its neighbour | `src/components/onboarding/DevotionTime.tsx` | 0.5h |
| 3.4 | Onboarding · name & time | Animate the `scale(1.02)` on select with the design's `.2s cubic-bezier(.34,1.56,.64,1)` instead of applying it instantly. `PartCard` becomes an `Animated.View` driven by a shared value on `selected` | same | 0.4h |
| 3.5 | Today | Approximate the flame button's per-state CSS filters. Rather than layering flat opacity on top of the palette shift, give `FlameButton` its own desaturated palettes so low/out read as the design's `grayscale`/`brightness` do | `src/components/Flame.tsx` | 0.5h |
| 3.6 | Devotions | Restyle the two custom-range fields to the design's date-input look: 1px `line` border, radius 12, padding 9/11, 13px — mostly already right; align the "to" label and field widths | `app/(tabs)/devotions.tsx` | 0.4h |
| 3.7 | Focus | Preset pills to the design's shape: outlined pill (`1px rgba(169,200,106,.4)`), translucent `rgba(169,200,106,.22)` fill when selected, `#A9C86A` label — currently a filled circle / solid green | `app/(tabs)/focus.tsx` | 0.4h |
| 3.8 | Reader | Save row as the design's two-column layout: "Saved to Reflections ✓" note on the left, the pill button on the right | `src/components/ReflectionField.tsx` | 0.5h |
| 3.9 | Settings | Collapse the two language sections into one "LANGUAGE" kicker with two labelled rows of cards, rather than two full kicker+card sections. The scripture-language row stays — it is an app feature the design has no column for — but it sits under the same heading | `app/settings.tsx` | 0.5h |
| 3.10 | Reflect | Date tag radius from `pillSoft` (20) to the design's 8 | `app/(tabs)/reflect.tsx` | 0.15h |

---

# Accepted — documented, not fixed

| Finding | Why |
|---|---|
| Bible verse numbers on the baseline, not raised | React Native has no inline superscript. The workarounds (a custom text-layout path, or measuring and absolutely positioning each number) are fragile and would break text selection and reflow |
| Focus timer has no `glowPulse` | It is a `drop-shadow` animation on gradient-filled text. React Native cannot animate a shadow on masked text |
| The twirl's far half renders mirrored | The spin is projected as `scaleX = cos θ` because Android will not apply `rotateY` to an SVG-backed view. A real rotation shows the mirrored back face too — this is faithful, not a defect |
| Focus's DND / history / restored cards, the streak repair card, the summary's locked state, the Bible chapter picker | App-original UI with no design counterpart. Styled from the design's own tokens; there is nothing to conform to |

---

# Verification

After each wave, not at the end:

```bash
node project/compare/cap.mjs <group>/<name>.png --link "abide://audit?insets=1&…"
node project/compare/audit.mjs diff
```

The emulator needs the audit frame: `adb shell wm density 400 && adb shell wm size 915x2050`,
and `wm size reset` / `wm density reset` afterwards.

Per-wave gates:

- **Wave 1** — `settings/01` card-top at ~173; `onboarding/07` below 8%; two rows in
  `translations`; the summary screen shows its own kicker and lede.
- **Wave 2** — no regression anywhere; `core/13` and `core/01` improve slightly.
- **Wave 3** — each page's own reference re-diffed once.

Then update `PAGE_AUDIT.md` with the new per-page percentages and re-run the full
capture for the contact sheet.

# Effort summary

| wave | items | effort |
|---|---|---|
| 1 — the four that matter | 4 (+3 riding along) | 6.75h |
| 2 — shared components | 4 | 1.7h |
| 3 — per-screen | 10 | 4h |
| verification | per wave | 1.5h |
| **total** | **18 changes** | **~14h** |
