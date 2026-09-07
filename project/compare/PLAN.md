# Abide v3 adoption — Phase 2 plan

Derived from `REPORT.md`. Ordered so that shared work lands first and every later item
inherits it. Effort is in focused hours for one engineer in the existing stack (Expo 54,
expo-router, Reanimated 4, react-native-svg, expo-linear-gradient). "Verify" means
re-capture with `compare/cap.mjs`, re-run `compare/audit.mjs diff`, update REPORT.md.

Decisions already made and honoured throughout: lantern signal; five tabs in the app's
order; kenat stays; ministry summary questions stay; five streak cell states stay;
sign-in screen untouched; `expo-blur` added; `begunToday` in a local meta row.

## 0. Prerequisites — ~2h

| # | item | effort |
|---|---|---|
| 0.1 | Add `expo-blur` (nav, ink card, gear, language pill). | 0.5h |
| 0.2 | Bundle Archivo ExtraBold (800) static cut; register `ArchivoExtraBold`; `fonts(lang).labelStrong`. Nokia Ethiopic Bold already covers Amharic. | 0.5h |
| 0.3 | Port the logic-class string tables the app lacks into `i18n.ts`: `GREET`, `MOTIVES`, `PARTS_TXT`, `CFG_TXT`, `STR` (Bible header, focus quote, reflect labels, "DAY STREAK", "BEST STREAK", "DEVOTIONS"), `LIB` (kicker, count, badges, pills, range labels, "to", results copy), `OB` extras ("Restart onboarding", ribbon/lantern copy). Verbatim, EN + AM. | 1h |

## 1. Shared tokens and components — ~22h

| # | item | design source | effort |
|---|---|---|---|
| 1.1 | **theme.ts**: kicker 11 / tracking 2 (9.5 and 13/4 variants), title scale 34·36·40·42·56, subtitle 18.5·19·21·22·24, body 15·15.5·16·16.5·17·17.5·18.5 with their line-heights; radii chip 20, card 20/22/24, tile 15, code 14; shadows `cardLift` (`0 10px 20px -16px rgba(31,38,18,.45)`), `cardLiftBig`, `inkCard`, `inkVerse`; colours `#5a6749`, `#9aa87e`, `#e7ebd6`, `#e8eed6`, `#c98a6a`, `#5a6749`, `#a3ad8f`, `#dfe9c4`, `#1b2610`. Keep `theme.font.*` until 2.x migrations finish, then delete with the Noto files. | tokens block, README | 2h |
| 1.2 | **Text primitives** `Kicker`, `Title`, `Subtitle`, `Body`, `Numeral` bound to `fonts(lang)` so screens stop re-declaring families. | — | 1.5h |
| 1.3 | **FloatingNav**: custom `tabBar` for expo-router `Tabs` — 88px, `26/26/0/0`, `rgba(11,15,4,.86)` + `BlurView` 16, inset ring, five 64px items, 42px icon chips, active gradient chip + lime glow, 10px labels; stroke-2 SVG icons from `ICONS` (+ reflect). `NavVisibilityContext` with `hide()/show()`; Reanimated `translateY 130 / opacity`, `.5s cubic-bezier(.4,0,.2,1)`. Content bottom padding 120–130 via `theme.layout.navClearance`. | nav markup ll.870–878 | 4h |
| 1.4 | **PrimaryButton**: 52/18 lime gradient, 15/800 label, arrow slot, disabled (`#e2e6cf`/`#93a17a`), `ctaGlow` 3.4s shadow pulse (Reanimated on `shadowRadius/shadowOpacity` + Android `elevation`), `ctaGlowStrong` variant reserved. Replace every ink pill CTA. | CTA spec, keyframes | 2h |
| 1.5 | **ScreenHeader** (back 38 + kicker + optional trailing) and **BackButton**; sticky variant with paper fade for the reader. | onboarding/settings/series headers | 1h |
| 1.6 | **PaperCard** (radius 18/20/24, ring + lift shadow) and **InkCard** (`rgba(13,18,7,.92)`, blur 10, inset ring). | card specs | 1h |
| 1.7 | **Chip** (status/range/series): 7/15 or 6/13 padding, 20r, 12 or 11.5/700, active `#16200c`+`#A9C86A`, idle `#fff`/`#5a6749`/`#dde3c4`; horizontal scroll rows. | library ll.323–331 | 1h |
| 1.8 | **DayScene** as SVG: four gradients, sun/moon with glow, clouds, stars, horizon band, two birds; `part` prop; static positions per `DayScene.dc.html` `C` table; animations (breathe, bob, drift, twinkle, fly) behind a `animate` flag. Used by Today and the time cards. | DayScene.dc.html | 4h |
| 1.9 | **Flame**: 120×126 three-layer rotated squares, `flick1`/`flick2`, strong/low/out palettes and scales, smoke puffs (`smokeRise`); 40×44 button variant with state filters. | streak ll.150–163, today ll.68–75 | 2.5h |
| 1.10 | **Toggle**: `#A9C86A→#5E7E33` fill, knob `.25s` overshoot `(.34,1.56,.64,1)`, track colour transition. | settings ll.700–702 | 0.5h |
| 1.11 | **ProgressBar** (5/6px, `#e7ebd6`, gradient fill, `width .4s`). | series/summary | 0.5h |
| 1.12 | **RiseFade** wrapper (`.35s`/`.5s`, opacity + translateY 14). | keyframes | 0.5h |
| 1.13 | **Logic port** `src/lib/v3-logic.ts`: greeting/motivation pick (seeded per day, not per render), part-of-day for the hero (5/12/17/21 per design — reconcile with `skyPhaseFor` 5/9/17/20: adopt the design's), reminder arrival `(nowMin − remMin + 1440) % 1440 < remDur`, `begunToday` meta row `abide.begun.<ministryDate>` set when Begin study is tapped, streak state `strong/low/out` from `StreakSummary` (low = missed ≤ 4 of last 5, out = 0), tests. Kenat ↔ JDN equivalence test over 2010–2030 in `packages/domain/test`. | logic class ll.1321–1330, 1691–1695 | 2h |

## 2. Screens (in P0 order) — ~44h

| # | screen | work | effort |
|---|---|---|---|
| 2.1 | **Today** | Rebuild on `DayScene` + overlay gradient; flame button (`Flame` small, streak filters); gear (36 translucent blur circle → `/settings`); centred greeting block (kicker 13/700/4px, date `WEEKDAY · MON YYYY`, italic motivation 14.5, hero text colour by part); 150×222 `Mascot` centred (`top 192 / bottom 262`), face by streak state, drop shadow; `InkCard` devotion card (icon tile 46/15r, kicker 9/800/2px, `Subtitle` 22, meta with dot, inner 46px lime CTA "Begin study →"); lantern signal (`Mascot lantern` prop, arrival check, hides after Begin); keep the app's sync/empty states as ink cards; remove "Phase · Round" block and Settings link. Verify against core/01, today-states/01–06, 09. | 8h |
| 2.2 | **Focus** | Ink focus-family backdrop; ✕ 38 translucent; kicker "FOCUS · N MIN" 12/700/3px + italic quote; Anton 138 gradient timer (`MaskedView` over `LinearGradient`, or SVG `<Text>` with gradient fill) + `glowPulse`; 230×6 bar `width 1s linear`; three preset pills; ↺ 54 / play 84 radial / spacer; nav hide while running; restyle DND card, restored notice, history, "Last 30 days" as ink cards. Verify core/05–06. | 5h |
| 2.3 | **Reader** | Sticky `ScreenHeader` (kicker "SERIES · PART n" / "WEEKDAY READING", star circle); ref 11.5/800/2.5 lime → `Title` 40 → meta 12/600; ink verse card (radial, `22 22 6 6`, KEY VERSE label, italic 21/1.45 — use the day's first key verse text; the app stores refs only, so add the verse text via the bundled scripture DB where present, else fall back to the ref-only card) + "Read the full chapter" bar (`6 6 22 22`, `#1b2610`) opening the Bible tab; body `Body` 17.5/1.62 (purpose, then prayer as a second paragraph block with its own kicker); cross-refs as small chips under the bible bar; REFLECT kicker + card with question (`content_strings` or `LIB.genericQ`), inset field (`#F3F5E6`, 12r, no border), "Saved …" note + Save button (keep autosave; Save also flushes); keep the Done footer but restyle as `PrimaryButton` inside the scroll end. Verify core/11–13. | 6h |
| 2.4 | **Devotions library** | Header (kicker "MY LIBRARY", `Title` 34, count 12/700); search with icon + clear; status `Chip` row (scroll); range `Chip` row + Custom with two date fields (native date picker or masked input); series cards (icon tile, badge, `Subtitle` 24, arrow 34, gradient bar, pct, meta "n of N parts · span"); flat rows (number chip 32/11r by state, `Subtitle` 18.5, sub, pills READ-date / NOT READ / REFLECTION, star); result count line; 130 bottom padding. Verify core/07–09. | 6h |
| 2.5 | **Series detail** | `ScreenHeader` "SERIES"; `Title` 36; meta + pct; gradient bar; rows as 2.4 flat rows; summary `InkCard` per spec (chip 32/11r gradient, `Subtitle` 19, sub 11/600, arrow 30 circle) keeping the locked state. Verify core/10, 14. | 3h |
| 2.6 | **Bible** | Paper gradient variant; header (kicker "HOLY BIBLE · {translation}", `Title` 34, ‹ › 36 ink circles); move A/★/picker into a secondary row or overflow; verses `Body` 18.5/1.66 `#262c17` with superscript Archivo 11/800 lime numbers; bottom-nav hide on scroll-down > 56 (via `NavVisibilityContext`), top bar stays; 120 bottom padding. Verify core/02–04 (Amharic text). | 3.5h |
| 2.7 | **Streak** | `ScreenHeader` "MY STREAK" (back closes the modal); `Flame` 120 with state; Anton 92 count with state colour; "DAY STREAK" 11/800/4px; italic message + sub from `CFG_TXT` (with the app's real numbers substituted); tiles "BEST STREAK"/"DEVOTIONS" 9.5/800/2px `#a3b573`; repair card restyled to ink-card tokens; calendar card 22r `.06` + ring, cells 10r with number colours by state, DOW 8.5/800, footer "n of m days"; 120 bottom padding. Verify streak/03–06. | 4h |
| 2.8 | **Series summary** | Route the summary day to its own layout: `ScreenHeader` "SERIES SUMMARY", `Title` 36 = book title, lede 15.5 `#5b6647`, progress (bar + 11.5/800 lime), cards 20r with 28/10r chips and borderless inset textareas, "Finish series →" `PrimaryButton` in the scroll (keeps the completion path). Verify series-summary/01–02. | 2.5h |
| 2.9 | **Settings** | Section gap 22, labels 11/2px inset 6, cards 20r; name row 14.5/600 Archivo label; reminder row 15/700 + 12/600; kicker 9.5 for the time block; language as two cards (chip 30/10r + label) — keep the scripture-language choice as a second pair of cards under a second kicker; account rows 15/700 with chevrons; footer "Restart onboarding" (→ Welcome, keeps the session; the app's onboarding needs a `restart` flag to allow re-entry) + "Abide {version}" 11/600 `#a3ad8f`. Verify settings/01–04. | 3h |
| 2.10 | **Onboarding** | Code: active box by index (not focus), filled `#b9c49a`, full-width accepted row with gradient tick + `RiseFade`. Name/time: `DayScene` in the cards, period word in the time label, ring outside the card (`box-shadow` → wrapper view), `scale 1.02` with overshoot, gradient tick; panel rows (8/8/8/16, label 12.5/700 Archivo `#5b6647`, glyph `#16200c`, `#eef1e2` dividers, value min-width 104), summary row (clock SVG, 12/700 `#75844a`, value 13/800 `#3f5622`). Notifications: card as a row (icon 38/11r mascot-gradient with peeking face, text column with "Abide … now" justified), panel 26/14 padding + design radial, drop "→" from Allow, "Not now" 13.5/700 `#75844a`. Kicker/pill/title spacing per tables. Verify onboarding/02–07. | 4h |
| 2.11 | **Welcome** | `letter-spacing -1` on the wordmark, mascot drop shadow, tagline max-width 260, footer `0 26 34` with the CTA at the design's height (reserve the link row's space), glow. Verify onboarding/01. | 1h |
| 2.12 | **Celebration** | Focus-family backdrop variant, five confetti shapes with `floatY` timings, mascot 110 + shadow + `mDouble`, kicker 11/4px at 34 gap, tile label colour. Verify series-summary/03. | 1.5h |
| 2.13 | **Reflect tab** | `Chip` styles, "Custom range" + date fields, date tag 9/800/1.6 20r, card 20r/padding; empty copy from `OB`/`LIB`. No reference frame: capture and keep as an app frame for future diffs. | 1.5h |

## 3. Motion — ~12h

| # | item | effort |
|---|---|---|
| 3.1 | Mascot `floatY`: `translateY 0→-10`, constant `rotate(-3deg)`, 4.5s ease-in-out; `mascotSad`: ±2.5° + `translateY 0→5`, 5.5s; drop shadow. | 1h |
| 3.2 | Mascot moves: port the nine keyframe sets (`mHop … mStep`) as Reanimated `withSequence`/`withTiming` at the keyframe percentages, `iter` support, `perspective 700` for `mTwirl` (`rotateY`), `mWinkLid` overlay; scheduler 10–20s on strong streak, tap → random not-last, ignore while running; `canMove` (Today only, not out). | 5h |
| 3.3 | Press squish `scale(1.06,.9)`/`.16s (.34,1.56,.64,1)` on press-in, release to 1. | 0.5h |
| 3.4 | Celebration `mDouble` exact keyframes (1.6s, three hops with squash) replacing the custom loop. | 1h |
| 3.5 | `ctaGlow` on `PrimaryButton`; `ctaGlowStrong` unused (glow variant). | in 1.4 |
| 3.6 | `lanternFlick` + `riseFade .6s` entry on the lantern. | 0.5h |
| 3.7 | Flame `flick1/flick2/smokeRise` (in 1.9); streak-state transitions `transform/filter .5s`. | in 1.9 |
| 3.8 | `riseFade` on library/series/reflect rows and the notification card; toggle overshoot; time-card select spring; progress `width .4s`; nav hide `.5s`. | 2h |
| 3.9 | Verify with `compare/motion.mjs` (idle mid, sad mid, hop 0/300/420/660/900, jelly, twirl, side-step, double-hop 0/192/576, press) and update the Motion table. | 2h |

## 4. Verification and clean-up — ~4h

- After each screen: capture → diff → update REPORT.md until every row is P2 or resolved.
- Remove `theme.font.*` and the five Noto files once 2.1–2.8 land; typecheck.
- Leave the audit-mode files in place (dev-only) — they are the regression harness;
  document the deep-link params in `compare/README` (or fold into COMPARE.md).
- Restore the emulator (`wm size reset`, `wm density reset`) and Daniel's
  `ui_language` when the work is done.

## Totals

| phase | hours |
|---|---|
| 0 Prerequisites | 2 |
| 1 Shared | 22 |
| 2 Screens | 44 |
| 3 Motion | 12 |
| 4 Verify | 4 |
| **Total** | **~84h (≈ 10–11 focused days)** |

## Open points to confirm before Phase 3

1. **Verse text in the reader.** The design's KEY VERSE card shows the verse text; the
   app stores references only, and English scripture is not bundled. Proposal: render
   the text from the scripture DB when the reader language has it, else the ref-only
   card. If you would rather keep refs only, 2.3 drops ~1h.
2. **Reader's Save button.** Autosave stays (app decision); the design's Save button
   becomes a "Saved ✓" affordance that also flushes. Say if you want a real Save.
3. **Focus presets.** Design has 5/15/25; the app has 5/10/15/20/30. Proposal: adopt
   the design's three.
4. **Streak label copy.** "DAY STREAK / BEST STREAK / DEVOTIONS" (design) vs
   "CURRENT / BEST / TOTAL DAYS" (app). Proposal: design copy; "DEVOTIONS" counts
   counted completions as today.
5. **Part-of-day boundaries.** Three sets exist (design hero 5/12/17/21, app sky
   5/9/17/20, domain reminder 6/12/18/21). Proposal: the hero and time cards use the
   design's; the reminder window keeps the domain's (it mirrors the DB trigger).
