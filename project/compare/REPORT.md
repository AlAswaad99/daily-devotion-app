# Abide v3 pixel audit — Phase 1 report

Audited 2026-09-04 against `project/screenshots/` (70 frames) and the inline CSS in
`project/Abide v3.dc.html`. No app code was restyled during the audit; the only app
changes are the dev-only audit mode described under *Method*.

## Method

**Frame geometry.** The reference PNGs are the whole design frame — a 392×846 phone with
a 13px bezel and a 128×30 notch — scaled to 250×540 and sometimes cropped tighter. The
inner screen is therefore **366×820 CSS px**, not 392×846. `compare/audit.mjs prep`
finds the notch in each PNG (the only pure-black feature on every frame), derives the
scale (0.609 for `core/`, 0.633 for most others, 0.641 for `series-summary/`) and crops
to the inner screen (`compare/ref/`, `meta.json` records the rect per file). The
emulator was set to the same logical size — `wm density 400`, `wm size 915x2050` =
366×820dp — so app captures scale to the reference size with no aspect change.

**Masks.** The design draws a mock iOS status bar in the top 44px; Android draws its own
in the top 24dp. Both sides are painted out for the top 44px and the bottom 16px (the
gesture pill). Mismatch percentages below exclude the masked rows.

**Safe area.** In audit mode the app is given the design's insets (top 44, bottom 0) so
headers line up; on a real device Android's inset is ~24dp and every header sits 20dp
higher than the frame. That is a device fact, not a defect, and is not counted below.

**Audit mode (dev only).** `apps/mobile/src/lib/audit.ts` + `app/+native-intent.ts`.
A deep link `abide://audit?…&to=/path` sets overrides — design insets, a forced streak
count, a forced sky, onboarding step/values with redirects disabled, a marker-flash
restart of the mascot animation — and rewrites itself to the target route. Everything is
gated on `__DEV__`. Captures: `compare/cap.mjs`; motion: `compare/motion.mjs`;
contact sheets: `compare/sheet.mjs`. App captures live in `compare/app/`, overlays and
`ref | app | diff` strips in `compare/out/`.

**Data.** The dev account "Daniel" (switched to `ui_language = en` for the audit;
`reader_language` back to `am`, its original). Content is the ministry's real Ruth /
Psalms / 1 Timothy series, so copy in cards and titles differs from the design's John /
Judges sample data everywhere. Those differences are **content, not defects**, and are
not listed. The bundled scripture DB has no English text, so Bible frames were captured
with Amharic scripture (layout audited, type not).

**Not captured.** `streak/01-02` (grid variant *b*; the design's default and the app's
choice is *a*). `today-states/07` and `08` (glow and ribbon signal variants; lantern was
chosen) are diffed against the plain Today capture and listed as N/A. Animation frames:
see *Motion*.

**Accepted divergences (not graded).** Per the pre-audit decisions: no "I don't have a
code" path; the email/password sign-in screen (no design, excluded); five tabs in the
app's order (Today · Devotions · Bible · Focus · Reflect); ministry-authored summary
questions and their count; the five streak cell states; kenat for the calendar; the
app's repair card on the streak screen; the reader's Done/completion footer and the
"Phase · Round" line, which have no design counterpart.

**Severity.** P0 = wrong content/state or a screen that is structurally a different
design; P1 = > 4px or wrong token/font; P2 = ≤ 4px / anti-alias / minor copy.

## Automated overlay (pixelmatch, threshold 0.1)

| ref | mismatch | ref | mismatch |
|---|---|---|---|
| core/01-today-strong-streak | 89.4% | onboarding/01-welcome | 12.8% |
| core/02-bible-john15 | 21.7% | onboarding/02-enter-code-empty | 3.6% |
| core/03-bible-scrolled-nav-hidden | 13.4% | onboarding/03-enter-code-partial | 3.8% |
| core/04-bible-scrolled-up-nav-back | 22.5% | onboarding/04-enter-code-accepted | 12.3% |
| core/05-focus-idle-25min | 94.1% | onboarding/05-name-time-default | 22.6% |
| core/06-focus-running | 95.1% | onboarding/06-name-time-evening | 22.8% |
| core/07-devotions-library | 19.6% | onboarding/07-notifications | 13.0% |
| core/08-devotions-filter-completed | 18.1% | series-summary/01-summary-empty | 10.5% |
| core/09-devotions-filter-reflected | 18.7% | series-summary/02-two-answered | 11.5% |
| core/10-series-john | 19.5% | series-summary/03-celebration | 14.6% |
| core/11-reader-part2 | 22.2% | settings/01-top-reminder-on | 36.5% |
| core/12-reader-reflection-empty | 20.1% | settings/02-scrolled-time-cards | 53.6% |
| core/13-reader-today | 40.1% | settings/03-bottom-language-account | 37.5% |
| core/14-series-judges-complete | 19.6% | settings/04-reminder-off | 10.9% |
| today-states/01-streak-low | 90.1% | streak/03-grid-a-weekday | 21.6% |
| today-states/02-streak-out | 90.1% | streak/04-two-months-back | 21.7% |
| today-states/03-morning | 84.5% | streak/05-low-12-days | 19.7% |
| today-states/04-evening | 93.9% | streak/06-out-0-days | 18.3% |
| today-states/05-night | 86.4% | today-states/09-5tab-nav | 89.9% |
| today-states/06-lantern | 90.0% | today-states/07, 08 | N/A (variant) |

Nothing passes the < 1% bar; text alone guarantees that at 232px wide. The numbers sort
the screens into three bands that match the manual pass: **> 80%** — Today and Focus are
still the pre-v3 layout on a different surface; **18–55%** — same skeleton, wrong faces,
wrong chrome, or scrolled content; **< 15%** — onboarding and celebration, which were
built to v3 and differ in details.

---

## Global (shared tokens and components)

These appear on many screens and are listed once. Every per-screen table below assumes
them.

| element | design (Abide v3.dc.html) | app | Δ | sev |
|---|---|---|---|---|
| Bottom nav | `height:88px;padding:0 12px 16px;border-radius:26px 26px 0 0;background:rgba(11,15,4,.86);backdrop-filter:blur(16px);box-shadow:0 -10px 30px -10px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.07) inset` — items `width:64px`, icon chip `42×42;border-radius:14px`, active chip `linear-gradient(160deg,#D9E8A8,#8FB052 60%,#5E7E33)` + `0 8px 16px -4px rgba(143,176,82,.55)`, label `{{fLabel}} 10px/700 ls .5px`, colour `#F2F3E2` active / `#9aa87e` idle; stroke-2 SVG icons from `ICONS` | expo-router default `Tabs`: white bar, `borderTopColor #dde3c4`, text glyphs `◔ ▤ ✝ ◎ ✎` at 18px, label 11px system, active `#5E7E33`, idle `#8a9670` | structural | **P0** |
| Nav hide | `transform:translateY(130px);opacity:0;transition:transform .5s cubic-bezier(.4,0,.2,1),opacity .4s` on onboarding, Settings, Summary, Celebration, Focus running, Bible scroll-down | onboarding/settings/summary/celebration are stack routes so the bar is absent (OK); Focus running and Bible scroll do not hide it | missing on two states | P1 |
| Primary CTA | `height:52px;border-radius:18px;background:linear-gradient(160deg,#D9E8A8,#8FB052 72%,#6f9440);color:#16200c;{{fLabel}} 15px/800;gap:9px;box-shadow:0 12px 24px -12px rgba(94,126,51,.6)` + `ctaGlow 3.4s` | `CtaGradient` (vertical, stops 0/.72/1) 52/18, Archivo Bold 15, shadow `#5E7E33 .45 r12 y8`; **no glow animation**; Today/Reader/Focus/Bible/Library use an ink pill (`theme.color.ink`, radius 999) instead | glow missing everywhere; wrong component on 5 screens | P1 / P0 |
| Back button | `38×38;border-radius:50%;background:#16200c;color:#A9C86A;font-size:18px` | 38/`inkDeep`/`accentBright`, glyph 17px | ≤1px | P2 |
| Kicker | `{{fLabel}} 11px/700;letter-spacing:2px;color:#75844a` (9–12px, ls 1.6–4 by context) | `theme.size.kicker` 10px, `tracking.kicker` 1.6, `#75844a` — used at 10/1.6 everywhere | 1px + 0.4px tracking; the design's 800 weight has no bundled face (Archivo Bold only) | P2 |
| Paper card | `background:#fff;border-radius:18–24px;box-shadow:0 10px 20px -16px rgba(31,38,18,.45),0 0 0 1px #dde3c4` | `surface` + `borderWidth 1 #dde3c4` and, where used, `shadow.card` (`.18 r10 y6`) | RN border instead of ring (same look); lift shadow missing on most cards | P2 |
| Ink card | `background:rgba(13,18,7,.92);backdrop-filter:blur(10px);box-shadow:0 18px 34px -10px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.07) inset` | not built (Today card is paper) | — | see Today |
| Type: titles | Newsreader 34–56 / 1.06 (`fTitle`) | `fonts(lang).title` = Newsreader on v3 screens; Today, Bible, Focus, Library, Series, Reader still use `theme.font.body` = **NotoSansEthiopic** with `fontWeight 700` | wrong family on 6 screens | **P0** |
| Type: UI/labels | Archivo 400–800 (`fUI`/`fLabel`) | Archivo Regular/SemiBold/Bold bundled; no 800 cut. Same six screens use Noto | family on 6 screens; 800→700 elsewhere | P0 / P2 |
| Type: body | Newsreader 15–18.5 / 1.5–1.62 | Newsreader on v3 screens; NotoSerifEthiopic (`theme.font.reading`) in Reader/Bible | family on 2 screens | P0 |
| Type: numerals | Anton (`fNum`/`fTimer`) | Anton on v3 screens; Noto on Focus timer, series numbers, Library counts | family | P1 |
| Paper background | `linear-gradient(180deg,#F2F3E2 0%,#E9EDD4 100%)` (Bible: `#F3F4E4→#EAEEDB`) | `PaperBackdrop` on v3 screens; flat `#F2F3E2` on Today, Bible, Focus, Library, Series, Reader | gradient missing on 6 screens | P2 |
| Ink background | `radial-gradient(120% 70% at 50% 18%,#2c3a14,#18220a 55%,#070c03)` (welcome/focus family) and `…at 50% 0%,#22300f,#141d09 55%,#0a1005` (streak family) | `InkBackdrop` SVG radial, same stops; `welcome` light at 20% (design 20% on Welcome, 18% on Focus/Celebration) | 2% offset | P2 |
| Language pill (ink) | `padding:8px 13px;gap:7px;border-radius:30px;background:rgba(12,16,5,.42);backdrop-filter:blur(8px);box-shadow:0 6px 16px -4px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.18) inset`; EN `10px/800 ls 1px`, አማ `11px/800`, active `#A9C86A` idle `#8d9a78` | same padding/gap/bg/ring; both labels 11px ls 1; idle `#7c8a63`; no blur | 1px on EN; idle colour | P2 |
| Language pill (paper) | `padding:10px 13px;background:#16200c;box-shadow:0 6px 16px -6px rgba(0,0,0,.4)`, `top:44px;right:20px` | padding 8/13, no shadow, in the header row at `insets.top+10` (=54 in audit mode, design 44) | 2px pad, 10px y | P2 |
| Toggle | `50×30;border-radius:16px;background:linear-gradient(160deg,#A9C86A,#5E7E33)` on / `#d5dac4` off; knob `24px;top/left:3px;box-shadow:0 2px 6px rgba(0,0,0,.25)`; `translateX(20px)`, `.25s cubic-bezier(.34,1.56,.64,1)` | 50×30/15r, knob 24 travel 20, off `#d5dac4`; **fill is the CTA gradient** (`#D9E8A8→#8FB052→#6f9440`); knob 160ms, no overshoot | colour; easing | P2 |
| Chips (filters) | `padding:7px 15px;border-radius:20px;font-size:12px/700;` active `#16200c` bg + `#A9C86A` text; idle `#fff` / `#5a6749` / border `#dde3c4` | Library: `#1f2612` bg + white text, 13px, radius 999, padding 6/12; Reflect: `#16200c` + `#F2F3E2`, 13px, 8/14 | active text colour (lime vs white); size | P1 |

---

## core/01 · Today (strong streak) — also today-states/09 (5-tab)

**Verdict: P0 — the screen is the pre-v3 layout.** The app renders a paper page with a
faint sky wash, a 56px mascot in the header row, "Good morning / Daniel" in Noto, a
"Phase · Round" block with the main verse, a white devotion card with an ink "Read" pill,
and a "Settings" text link. The design is a full-bleed sky scene, a flame button, a gear,
a centred greeting block, a 150×222 mascot, an ink devotion card, and the floating nav.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Background | `DayScene` SVG sky (gradient per part + sun/moon, clouds, stars, horizon band, birds) + `linear-gradient(180deg,rgba(0,0,0,.14) 0%,transparent 26%,transparent 50%,rgba(6,10,0,.5) 100%)` | `Sky`: 16 stepped bands of one colour (`#f2d8bf` dawn, `#e4ecf1` day, `#eed2c0` dusk, `#d2d6e0` night) fading over 352dp on `#F2F3E2` | wrong surface family (paper vs scene) | **P0** |
| Flame button | `top:50px;left:18px;56×60` — CSS flame 40×44 (`34px` outer `linear-gradient(160deg,#F6BC45,#E8843C 55%,#C05A16)` rotated 45°, `18px` core `#FBE8B8`), `flick1 1.4s` / `flick2 1.1s`, `filter:drop-shadow(0 0 16px rgba(246,188,69,.55))` | 🔥 emoji 24px + count 13px `#F6BC45` in the header row, right side | position, artwork, count shown (design shows none on Today) | P1 |
| Gear | `top:54px;right:18px;36×36;border-radius:50%;background:rgba(12,16,5,.42);backdrop-filter:blur(8px);box-shadow:0 6px 16px -4px rgba(0,0,0,.4),0 0 0 1px rgba(255,255,255,.18) inset;color:#dfe9c4` + 17px SVG gear | "Settings" text link `#8a9670` below the card | missing | P1 |
| Greeting kicker | centred, `margin-top:104px` (from status row); `{{fLabel}} 13px/700;letter-spacing:4px;color:#3a230d` (`#f4f2e2` on evening); copy from `GREET[part]` (3 rotating) + `, {name}` | "Good morning" 13px Noto `#8a9670`, left, no rotation, no name | layout, font, colour, copy | **P0** |
| Date line | `12px/600;letter-spacing:2px;opacity:.65` — `{{weekday}} · {{monthYear}}` ("FRIDAY · SEP 2026") | absent | missing | P1 |
| Motivation | `{{fItalic}} italic 14.5px;opacity:.82;margin-top:11px;padding:0 48px;line-height:1.35` from `MOTIVES` (6) | absent (app shows the round's main verse in a bordered block instead) | missing / extra | P1 |
| Mascot | `150×222`, `top:192px;bottom:262px` centred (`perspective:700px`), `filter:drop-shadow(0 18px 18px rgba(0,0,0,.4))`, `border-radius:18px 18px 0 0`, clip `polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)`, `floatY 4.5s` | `Mascot size=56` (56×83) in the header, right; no drop shadow; bob -5px/2.8s (`waiting`) | size ×2.7, position, shadow | **P0** |
| Mascot face by state | strong = smile `40×20` arc `border:5px #2a160a`; low = neutral bar `34×5`; out = frown + brows `26×5` rotated ±14° + tear `#9CCBE8` + `grayscale(.35) brightness(.85)` | moods by completion: `waiting` = neutral bar, `pleased` = smile, `sad` = frown+brows+tear; strong-streak-unread renders **neutral**, design renders smile | state mapping | P1 |
| Devotion card | `left/right:18px;bottom:118px;gap:11px;padding:15px 15px 15px 17px;border-radius:26px;background:rgba(13,18,7,.92);blur(10px)` + icon tile `46×46;border-radius:15px;background:rgba(169,200,106,.16);color:#A9C86A`; kicker `9px/800 ls 2px #8d9a6f`; title `{{fSub}} 22px/1.1 #f3f5e4`; meta `11.5px/600 #a9b586` with 3px dot `#77835a`; CTA inside `height:46px;border-radius:16px` lime gradient `14.5px/800 ls .4px` "Begin study →" + `ctaGlow` | white card `radius 24`, `padding 24`, `border 1 #dde3c4`; eyebrow 11px Noto `#5E7E33` ls 1.2; title 22 Noto 600; meta 13 `#8a9670`; ink pill "Read" 999r, white text | ink card missing entirely | **P0** |
| Reminder signal (lantern) | inside the mascot: `right:-30px;bottom:48px;36×62` — arm `24×9 linear-gradient(90deg,#8E2A18,#C6452A)`, handle `12×11 border 2.5px #4a3a1e`, cap/base `26×6`/`28×6 #4a3a1e`, body `22×30;border-radius:5px;radial-gradient(circle at 50% 58%,#FBE8B8,#F6BC45 38%,#E8843C 78%,#C05A16);box-shadow:0 0 20px 7px rgba(246,188,69,.55);lanternFlick 1.3s`; enters `riseFade .6s`; shown while `(nowMin−remMin+1440)%1440 < remDur && !begunToday && streak≠out` | absent; no `begunToday` state; greeting never appends the name | missing | **P0** |
| Status row | mock clock/battery `padding:16px 26px 0;14px/700` | Android's own | masked | — |
| Pull-to-refresh, "not synced" / "no content" / "coming soon" cards, queued-count line | none | present | app-specific states, keep | — |
| Nav | see Global | see Global | | P0 |

**today-states/01 (low, 12)** — same P0 as above. Design: neutral mouth, flame button
`saturate(.55) brightness(.85);opacity:.7`, greeting "GOOD AFTERNOON" without name. App:
neutral mouth (coincidentally matching, because the day is unread), count "12".
**today-states/02 (out, 0)** — design: sad face + brows + tear, `mascotSad 5.5s`,
`grayscale(.35) brightness(.85)`, flame `grayscale(1) brightness(.7);opacity:.5`. App: sad
face + brows + tear ✓, no desaturation, flame glyph becomes "·". P1 on top of P0.
**today-states/03–05 (morning/evening/night)** — the app's `Sky` bands are the wrong
colours for every part (`#f2d8bf`/`#eed2c0`/`#d2d6e0` vs the DayScene gradients
`#FFE9B0→#FF9C72`, `#FFCB73→#6E54A0`, `#3A3E86→#101230`) and there is no sun, moon,
cloud, star or horizon art. Evening hero text should flip to `#f4f2e2`. P0 (within the
Today rebuild). Note the app's phase boundaries (`skyPhaseFor`: dawn 5–9, day 9–17,
dusk 17–20) differ from the design's (`morning 5–12, afternoon 12–17, evening 17–21`);
the domain `partOfDayForMinute` uses a third set (6/12/18/21) for the reminder window.
**today-states/06 (lantern)** — missing, P0. **07 (glow), 08 (ribbon)** — N/A, variant
not chosen. **09 (5-tab)** — the app's tab order is Today · Devotions · Bible · Focus ·
Reflect; the design's is Today · Bible · Focus · Devotions · Reflections. Accepted, but
the label copy "Reflect" vs "Reflections" is a P2 copy difference to settle.

---

## core/02–04 · Bible

**Verdict: P0/P1 — same skeleton (title + verses), wrong header, faces and nav
behaviour.** Captured with Amharic scripture (no English text is bundled).

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Background | `linear-gradient(180deg,#F3F4E4,#EAEEDB)` | flat `#F2F3E2` | gradient | P2 |
| Header | `padding:46px 24px 14px`; kicker "HOLY BIBLE · KJV" `12px/700 ls 2px #75844a`; title `{{fTitle}} 34px #1f2612` ("John 15"); ‹ › `36×36;border-radius:50%;background:#16200c;color:#A9C86A` right-aligned, `gap:8px` | white bar `padding 16/12`, `borderBottom 1 #dde3c4`, title 22 Noto Medium, "A" text-size and ☆ bookmark buttons 22px `#8a9670`; no kicker; no chapter arrows (prev/next are pills in the list footer) | structure | **P0** |
| Verses | `padding:6px 26px 120px`; `<p>` `{{fBody}} 18.5px/1.66 #262c17;margin:0 0 13px`; number `Archivo 11px/800 #5E7E33;vertical-align:6px;margin-right:6px` | rows `padding 6/4`, gap 8; text NotoSerif 16 `#1f2612` (scaled by member); number 11 Noto `#5E7E33` right-aligned `minWidth 18`, baseline | family, 2.5px size, 0.16 leading, number placement | P1 |
| Nav hide (03/04) | bottom nav `translateY(130px)` after `scrollTop>56 && dy>0`, returns on scroll-up | the **top** bar hides after 12px scroll-down and returns on scroll-up; bottom bar never moves | wrong element | P1 |
| Long-press highlight, search/picker, external "Open in YouVersion" fallback, text-size control | none | present | app features, keep | — |

---

## core/05–06 · Focus

**Verdict: P0 — pre-v3 layout on paper.** Design is the ink focus family with a giant
gradient timer.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Background | `radial-gradient(120% 70% at 50% 18%,#2c3a14,#18220a 55%,#070c03)` | flat `#F2F3E2` | surface family | **P0** |
| Close | `✕` `top:44px;left:22px;38×38;border-radius:50%;background:rgba(255,255,255,.08);color:#d5e0b5;font-size:20px` | none (it is a tab) | missing (design treats Focus as a tab too; the ✕ returns to Today) | P2 |
| Header | kicker "FOCUS · 15 MIN" `padding:46px 0 4px;12px/700 ls 3px #a3b573`; quote `{{fItalic}} italic 15px #7c8a63;max-width:240px;line-height:1.4` — `"Be still, and know that I am God."` | "Focus" 36 Noto Medium + intro sentence 16 `#8a9670` | copy, type, colour | P1 |
| Timer | `{{fTimer}} Anton 138px/.86 ls 1px;background:linear-gradient(180deg,#EAF4C0,#A9C86A 55%,#5E7E33);background-clip:text;glowPulse 4s` "15:00" | `ProgressRing` (dashed circle ~250dp) with 52px Noto Medium "10:00" inside | component | **P0** |
| Progress | bar `230×6;border-radius:3px;background:rgba(255,255,255,.1)` fill `linear-gradient(90deg,#A9C86A,#5E7E33)`, `width 1s linear` | ring stroke | component | P1 |
| Presets | 3 pills "5 min / 15 min / 25 min" `padding:9px 18px;border-radius:30px;14px/700;border:1px solid rgba(169,200,106,.4)`; active `rgba(169,200,106,.22)` / `#A9C86A`, idle `rgba(255,255,255,.05)` / `#9aa87e`; `margin-bottom:18px` | 5 circles 52px "5 10 15 20 30", active solid `#5E7E33` white text, idle white | count, shape, colours, copy ("min" suffix) | P1 |
| Controls | ↺ `54×54 rgba(255,255,255,.08) #d5e0b5` · play `84×84;radial-gradient(circle at 38% 30%,#D9E8A8,#8FB052 60%,#5E7E33);color:#1a230c;font-size:30px/800;box-shadow:0 14px 28px -6px rgba(143,176,82,.6),0 0 0 1px rgba(255,255,255,.4) inset` · 54px spacer; `margin-bottom` 18→ larger when running (nav hidden) | "Begin" pill `#5E7E33` white 16 Noto, `padding 16/40`; running: white pill "End" `#5E7E33` text | component | **P0** |
| Running (06) | timer counts, bar fills, presets hidden, nav `translateY(130px)`, ✕ stays | header hidden, ring fills, "End" pill, nav stays | nav | P1 |
| DND "Allow silencing" card, restored notice, session history, "Last 30 days" | none | present | app features; restyle as ink cards | — |

---

## core/07–09 · Devotions library

**Verdict: P1 (P0 on the series cards).** Same information architecture (search, status
chips, series cards, flat results), wrong faces and card anatomy, missing range filter.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Header | `padding:46px 26px 10px`; kicker "MY LIBRARY" `12px/700 ls 2px #75844a`; title `{{fTitle}} 34px #1f2612` + count "30 devotions" `12px/700 #93a17a;padding-bottom:8px` right-aligned | "Devotions" 36 Noto 700, `paddingTop 56`; no kicker, no count | kicker/count missing; font | P1 |
| Search | `background:#fff;border:1px solid #dde3c4;border-radius:16px;padding:11px 14px;gap:10px` + 18px search SVG `#93a17a`; input `{{fBody}} 15px #2c3318`; ✕ clear when non-empty | TextInput 18r, padding 14/10, Noto 16, no icon, no clear | icon, radius 2px, font | P2 |
| Status chips | 5: All · Completed · Unread · Reflected · Favorites (see Global chip spec); row `gap:8px;overflow-x:auto` | 5 (Favourites), wrapping row, `padding 6/12`, 13px Noto, active `#1f2612` + white | active text lime, wrap vs scroll, font | P1 |
| Range chips | second row: All time · Last month · Last 3 months · Last 6 months · Last year · Custom range, `padding:6px 13px;11.5px/700`; Custom shows two `input[type=date]` `border:1px #dde3c4;border-radius:12px;padding:9px 11px;13px` with "to" between | **absent** (Reflect tab has a range row without Custom) | missing | P1 |
| Series card | `border-radius:24px;padding:16px 16px 18px 18px;box-shadow:0 14px 26px -18px rgba(31,38,18,.5),0 0 0 1px #dde3c4;riseFade .4s`; icon tile `46×46;border-radius:15px;background:rgba(94,126,51,.13);color:#5E7E33` (22px book SVG); badge pill `9px/800 ls 1.6px;padding:3px 9px;border-radius:20px` — CONTINUE (`#16200c`/`#A9C86A`), COMPLETE (`#D9E8A8`/`#3f5622`), IN PROGRESS (border `#dde3c4`/`#8a9670`); name `{{fSub}} 24px/1.08 #1f2612;margin-top:6px`; → circle `34×34 #16200c #A9C86A`; bar `5px #e7ebd6` fill `linear-gradient(90deg,#8FB052,#5E7E33)` (complete: `#A9C86A→#8FB052`) + pct `11.5px/800 #5E7E33`; meta `11.5px/600 #8a9670` "6 of 8 parts · John 1–15"; sorted current → in progress → complete | white 24r card `padding 20`, `border 1`; title 22 Noto 600; meta 13 `#8a9670` "11 of 11 days"; bar `6px #dde3c4` fill **`#F6BC45` amber**; no icon, badge, arrow, pct; DB order | anatomy, bar colour | **P0** |
| Flat result row (08/09) | count line `10px/800 ls 2px #93a17a` "4 results"; row `gap:13px;border-radius:18px;padding:14px 14px 14px 16px;` number chip `32×32;border-radius:11px;12.5px/800` (today `#F6BC45→#E8843C`/`#2a1a05`; read `rgba(94,126,51,.14)`/`#3f5622`; unread `#eef1e2`/`#98a382`); title `{{fSub}} 18.5px/1.12` (`#1f2612` read / `#5b6647` unread); sub `11px/600 #8a9670` "Isaiah · Isaiah 43:16–21"; pills `8.8px/800 ls 1.3px;padding:4px 9px` — "✓ JUL 10, 2026" (`rgba(94,126,51,.13)`/`#3f5622`), "NOT READ" (border), "✎ REFLECTION" (`#FAEBCF`/`#8a6224`); star 30px | row 18r `padding 16`; title 16 Noto; meta 11 date; marks ★ ✎ ✓ as 16px glyphs `#8a9670`/`#F6BC45`; no number chip, no pills, no count line | anatomy | P1 |
| Reflected + custom range (09) | range row + date inputs | Reflected filter only | missing | P1 |
| Padding bottom | `130px` (nav clearance) | list `padding 24`, stock tab bar | — | P2 |

---

## core/10, 14 · Series detail (John in progress; Judges complete)

**Verdict: P1.** Structure matches (title, meta, bar, rows, summary card); faces and row
anatomy differ.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Header | `padding:44px 20px 0`: back 38 + kicker "SERIES" `11px/700 ls 2px #75844a` | none — `paddingTop 64` then the title; back is the OS gesture | missing | P1 |
| Title block | `padding:14px 26px 0`; `{{fTitle}} 36px/1.06`; meta `12px/600 #75844a` "6 of 8 parts · John 1–15" + pct `12px/800 #5E7E33` right; bar `6px;border-radius:4px;#e7ebd6;margin-top:10px` fill `linear-gradient(90deg,#8FB052,#5E7E33)` | 36 Noto 700; meta 13 `#8a9670` "18 of 22 days"; bar `6px #dde3c4` fill `#F6BC45` | font, pct missing, bar colour | P1 |
| Rows | as library flat rows (chip 32/11r, fSub 19, ref 11, pills, star) `gap:9px;padding:18px 20px 130px` | 18r row `padding 12`, circle number 32 `#eef1e2`/`#5E7E33` 13 Noto 700, title 16 Noto, meta 11 date, marks ★ ✎ ✓ | anatomy | P1 |
| Summary card (14) | `background:#16200c;border-radius:18px;padding:15px 14px 15px 16px;box-shadow:0 14px 26px -16px rgba(20,30,5,.7)`; chip `32×32;border-radius:11px;linear-gradient(160deg,#D9E8A8,#8FB052)` "4"; title `{{fSub}} 19px #F2F3E2` "Series summary"; sub `11px/600 #a3b573` "4 questions · finish the series"; → `30×30 rgba(169,200,106,.18) #A9C86A` | `inkDeep` 24r `padding 16`; chip 34/12r solid `#A9C86A` "3"; title Newsreader 19 `#F2F3E2` "Series summary"; sub 12.5 `#a3b573`; → glyph 18 | radius 6px, chip 2px, gradient, arrow circle; locked state is app-only | P2 |

---

## core/11–13 · Reader (devotion detail)

**Verdict: P0/P1.** The app reader is the pre-v3 detail page: eyebrow, Noto title,
passage, purpose, key-verse card, prayer card, cross-ref chips, reflection field, and a
fixed footer with an ink Done pill. The design is a sticky back/kicker/star header, ink
verse card with a "Read the full chapter" bar, Newsreader body, and a REFLECT card with
its own Save button.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Header | sticky `padding:18px 22px 12px;background:linear-gradient(180deg,#F2F3E2 70%,rgba(242,243,226,0));backdrop-filter:blur(4px)`; back 38 ink; kicker `11px/700 ls 2px #75844a` "JOHN · PART 2" / "FRIDAY READING"; star `38×38;background:#fff;border:1px solid #dde3c4` right | eyebrow "NEHASE 29, 2018 · READ LATE" 11 Noto `#8a9670`; ☆ 26px glyph beside the title; no back button | structure | P1 |
| Ref + title + meta | ref `11.5px/800 ls 2.5px #5E7E33` "John 2:1–11"; title `{{fTitle}} 40px/1.06 #1f2612;margin-top:7px`; meta `12px/600 #8a9670` "John · Part 2 · 4 min" | title 36 Noto 700; passage "Psalm 63" 13 `#5E7E33` 600 **below** the title | order, font, size 4px | P1 |
| Verse card | `margin-top:22px;padding:22px;border-radius:22px 22px 6px 6px;radial-gradient(120% 90% at 50% 0%,#2c3a16,#131a0a);color:#eef2da;box-shadow:0 16px 30px -12px rgba(20,30,5,.5)`; label "KEY VERSE · John 15:5" `11px ls 2px #A9C86A/700`; verse `{{fItalic}} italic 21px/1.45` | white "KEY VERSES" card 18r `padding 16` with reference text 16 Noto (no verse text) | surface, content (app has refs only) | P1 |
| Bible button | `padding:14px 16px 14px 18px;border-radius:6px 6px 22px 22px;background:#1b2610;color:#A9C86A;box-shadow:0 12px 22px -14px rgba(20,30,5,.6)`; 15px book SVG; label `13.5px/700 #dfe9c4` "Read the full chapter"; → `28×28 rgba(169,200,106,.16)` | cross-reference chips `accentSoft` pill 999r, 13 Noto `#5E7E33` | component | P1 |
| Body | `gap:14px;margin-top:26px`; `{{fBody}} 17.5px/1.62 #333c22` | purpose 16 NotoSerif `#1f2612`; prayer card `#F3F5E6` 18r | family, 1.5px, leading | P1 |
| Reflect | label "REFLECT" `11px/700 ls 2px #75844a;margin-top:30px`; card `padding:18px 20px;border-radius:18px;#fff;border:1px #dde3c4`; question `{{fBody}} 17px/1.5 #333c22`; textarea `min-height:96px;background:#F3F5E6;border-radius:12px;padding:12px 14px;16px/1.5 #2c3318;margin-top:10px`; "Saved to Reflections ✓" `12px/700 #5E7E33` + Save `padding:10px 20px;border-radius:24px` (`#16200c`/`#A9C86A` ready, `#e2e6cf`/`#93a17a` idle) | label "YOUR REFLECTION" 11 Noto `#8a9670`; no question; TextInput `min 96` **white with border** 18r, 16 Noto; autosave, "Saved on this phone" 11 right | question missing, field colours, no Save button (autosave is an app decision — keep, but restyle the field) | P1 |
| Footer | none (design has no completion control) | fixed bar `#F2F3E2` border-top, ink pill "Done" / "✓ Completed", seconds hint | app-specific, keep | — |
| Scrolled (12) | reflection card near the bottom, `padding-bottom:130px` | reflection field then 96px spacer, footer overlays | — | P2 |

---

## onboarding/01 · Welcome

**Verdict: P2, plus one P1 for the missing glow.** Built to v3.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Background | `radial-gradient(120% 70% at 50% 20%,#2c3a14,#18220a 55%,#070c03)` | `InkBackdrop welcome` (same stops, light at 20%) | — | ✓ |
| Language pill | `top:54px;right:18px` translucent (Global) | `insets.top+10` = 54, `right 22` | 4px x | P2 |
| Mascot | `110×162`, `floatY 4.5s`, `filter:drop-shadow(0 18px 18px rgba(0,0,0,.4))` | `size 110`, idle bob 3px/4.4s, no shadow | shadow; motion (see Motion) | P2 |
| Wordmark | `{{fTitle}} 56px/1;color:#F2F3E2;margin-top:34px;letter-spacing:-1px` | Newsreader 56/60, `marginBottom 32` on the mascot, no negative tracking | 1px tracking, 2px | P2 |
| Tagline | `{{fItalic}} italic 17px #a3b573;line-height:1.4;margin-top:12px;max-width:260px` | NewsreaderItalic 17, `marginTop 12`, `paddingHorizontal 40` (≈ 286 max) | ≤ 26px wrap width | P2 |
| CTA | Global spec + `ctaGlow 3.4s` "Get started →"; block `padding:0 26px 34px` with a `13.5px/700 #a3b573` link below (`padding:13px`) | same button; `paddingHorizontal 22`, `paddingBottom insets.bottom+24`; no link (accepted) | CTA sits ~52px lower than the design's because the link row is gone; glow missing | P1 |

---

## onboarding/02–04 · Enter your code

**Verdict: P1 on two states, otherwise P2.** Closest screen in the audit (3.6%).

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Frame | `padding:44px 24px 30px` | header `insets.top+10`, content `paddingHorizontal 22, paddingTop 24` | 2px x | P2 |
| Kicker | "STEP 1 OF 3" `11px/700 ls 2px #75844a` | 10px ls 1.6 | 1px | P2 |
| Language pill | solid ink, `padding:10px 13px`, `top:44px;right:20px` | padding 8/13 in header row | 2px | P2 |
| Title | `{{fTitle}} 36px/1.06;margin-top:28px` | Newsreader 36, lineHeight 40.3, `paddingTop 24` | 4px y | P2 |
| Body | `{{fBody}} 16px/1.5;color:#5b6647;margin-top:10px` | Newsreader 16, `#4a5436`, `marginTop 12` | colour token (`inkSecondary` not `inkBodySoft`), 2px | P2 |
| Boxes | `margin-top:30px;gap:8px;height:58px;border-radius:14px;#fff;border:1.5px` — empty `#dde3c4`, filled-while-incomplete `#b9c49a`, **active `#5E7E33` + `0 0 0 3px rgba(143,176,82,.18)` regardless of focus**, all `#8FB052` when complete; char `{{fNum}} 26px #1f2612` | `marginTop 32`, gap 8, 58/14, border 1.5; active only **while focused** (02 shows no active box); filled uses `#dde3c4`; ring approximated with an elevation shadow; Anton 26 | active-state rule (02, 03); filled colour | P1 |
| Hint | `11.5px/600 #93a17a;margin-top:10px;padding-left:4px` (Archivo) | Newsreader 11.5 `#8a9670`, `marginTop 12` | family, colour | P2 |
| Accepted row (04) | `margin-top:18px;padding:13px 16px;border-radius:16px;background:rgba(94,126,51,.1);gap:11px;riseFade .35s` full width; tick `28×28 linear-gradient(160deg,#D9E8A8,#8FB052) #16200c 13px/800`; text `14px/700 #3f5622` | `alignSelf flex-start` pill 999r `padding 8/12`, `marginTop 20`; tick solid `#A9C86A`; Archivo Bold 14 `#3f5622`; no entrance | width/radius/padding | P1 |
| CTA | disabled `#e2e6cf`/`#93a17a`, `box-shadow:none`, enabled lime; "Continue →" | same | — | ✓ |
| Link | "I don't have a code" `#75844a 13.5px/700` | none (accepted) | CTA ~44px lower | — |

---

## onboarding/05–06 · Name + devotion time

**Verdict: P1.** Structure and geometry match; the time cards lack the sky artwork and
the period word, and the fine-tune panel's type is off.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Name input | `margin-top:22px;box-shadow:0 0 0 1px #dde3c4;border-radius:18px;padding:16px 18px;{{fBody}} 20px #1f2612` | `marginTop 16` (+ ScrollView `paddingTop 8`), border 1.5, 18r, 16/18, Newsreader 20 | 0.5px ring | P2 |
| Kicker | "DEVOTION TIME · ETHIOPIAN CLOCK" `11px/700 ls 2px;margin-top:28px;padding-left:4px` | 10/1.6, `marginTop 28` | 1px | P2 |
| Cards | `grid 1fr 1fr;gap:8px;height:104px;border-radius:18px;overflow:hidden;margin-top:10px`; **DayScene** art per part; overlay `linear-gradient(180deg,rgba(6,10,0,0) 30%,rgba(6,10,0,.72))`; label `10px/800 ls 1.6px #F2F3E2` at `left:12px;bottom:9px`; time `11.5px/700` — "12:00 morning" (period word), selected `#D9E8A8`, idle `rgba(242,243,226,.75)` | `48.4%` × 104, 18r, `marginTop 12`; plain 3-stop gradient (the DayScene sky colours ✓) but **no sun/moon/clouds/stars/horizon**; overlay ✓; label 10/1.6 `#F2F3E2` at `padding 10`; time "12:00" — **no period word** | artwork; copy | P1 |
| Selected card | `box-shadow:0 0 0 2.5px #8FB052,0 12px 24px -12px rgba(94,126,51,.6);transform:scale(1.02)`, `transition .2s cubic-bezier(.34,1.56,.64,1)`; tick `22×22 top/right 8 linear-gradient(160deg,#D9E8A8,#8FB052) #16200c 12px/800` | `borderWidth 2.5 #8FB052` (inside the box, shrinking the art) + `shadow.card`; no scale; tick 22 solid `#A9C86A` | ring inside vs outside (2.5px art loss), scale, gradient | P2 |
| Unselected card | `box-shadow:0 0 0 1px #dde3c4` | `borderWidth 1 #dde3c4` | — | ✓ |
| Panel | `border-radius:18px;#fff;border:1.5px solid #dde3c4;overflow:hidden;margin-top:8px` | same, `marginTop 12` | 4px | P2 |
| Rows | `padding:8px 8px 8px 16px;border-bottom:1px solid #eef1e2`; label `12.5px/700 #5b6647` (Archivo); −/+ `34×34;border-radius:50%;background:#eef1e2;color:#16200c;18px/700`, `gap:4px`; value `{{fNum}} 15.5px #1f2612;min-width:104px` | `padding 10/14`, divider `#dde3c4` inset 14; label **Newsreader 15 `#333c22`**; buttons 34 `#eef1e2` glyph 19 **`#3f5622`**; gap 12; Anton 15.5 `minWidth 74` | label family/size/colour; glyph colour; divider colour; value width | P1 |
| Disabled step | `color:#b3bd97` | `#b3bd97` | — | ✓ |
| Summary row | `padding:12px 16px;background:#F3F5E6;gap:10px`; 16px clock SVG `#5E7E33`; label `12px/700 #75844a` "Your devotion time"; value `13px/800 #3f5622` "12:00 – 12:30 morning" (Archivo) | `padding 11/14`, gap 8; "◷" glyph 15 `#75844a`; label Newsreader 13 `#5b6647`; value **Anton 13.5 `#1f2612`** | icon, label family, value family/colour | P1 |
| Duration label | "30 min", "1 hour", "1½ hours", "2 hours" | same via `formatDuration` | — | ✓ |
| Evening state (06) | 12:45 evening / 1 hour / "12:45 – 1:45 evening" | same values | — | ✓ |
| CTA | "Continue →" at the bottom, `flex:1` spacer | same, pinned footer | — | ✓ |

---

## onboarding/07 · Notifications

**Verdict: P1 (card layout).**

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Body copy | "One reminder each morning. No streak guilt, no noise — switch it off any time in Settings." | same | — | ✓ |
| Panel | `margin-top:34px;padding:26px 14px;border-radius:26px;radial-gradient(120% 90% at 50% 0%,#2c3a16,#131a0a);box-shadow:0 16px 30px -12px rgba(20,30,5,.5)` | `marginTop 32`, `padding 20`, 26r, `InkBackdrop streak` (`#22300F→#0A1005`, lighter than `#2c3a16→#131a0a`), no drop shadow | 6px padding; gradient stops | P2 |
| Notification card | `padding:13px 14px;border-radius:18px;background:rgba(242,243,226,.96);gap:12px;box-shadow:0 10px 24px -10px rgba(0,0,0,.5);riseFade .5s`; **row layout**: app-icon `38×38;border-radius:11px;linear-gradient(155deg,#A0331F,#C6452A 60%,#8E2A18)` (mascot face peeking from the bottom) on the left, text column on the right — `Abide … now` `11px/700 #8a9670` justified apart; greeting `14px/800 #1f2612`; body `13px/1.35 #4a5436` "Today's devotion: Abide in the Vine · 4 min" | padding 13, 18r, `.96` ✓; **column layout**: icon + "Abide · now" in one row, then greeting 15 Archivo Bold, then body 13.5 Newsreader; icon `inkDeep` background with a 26px mascot | layout; icon background; sizes | P1 |
| Kicker under card | "EVERY DAY · 12:00 – 12:30 morning" `10px/800 ls 2px #a3b573;margin-top:16px` | same text, 10/1.6 `#a3b573`, gap 16 | tracking | P2 |
| CTA | "Allow reminders" (no arrow) | "Allow reminders →" | arrow | P2 |
| Link | "Not now" `#75844a 13.5px/700;padding:13px` | `#8a9670` 14.5 Newsreader, `paddingVertical 6` | colour/size/family | P2 |

---

## settings/01–04

**Verdict: P1.** Same sections and rows; card/toggle/type details differ; language cards
and the footer links are laid out differently.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Header | `padding:44px 20px 0`: back + "SETTINGS" kicker; title `padding:14px 26px 0;36px/1.06` | back + kicker at `insets.top+10`, `paddingHorizontal 22`; title 36/38 `paddingTop 16` | ≤ 4px | P2 |
| Sections | `gap:22px;padding:22px 20px 40px`; label `11px/700 ls 2px;padding-left:6px`; card `#fff;border-radius:20px;box-shadow:0 0 0 1px #dde3c4` | `marginTop 28` per section; label 10/1.6 `marginBottom 8`, no inset; card 18r border 1 | 6px gap, 2px radius | P2 |
| Name row | `padding:15px 18px`; label `14.5px/600 #5b6647` (Archivo); input `{{fBody}} 16px #1f2612` right | `padding 13/14`; label Newsreader 15.5 `#333c22`; input Newsreader 15.5 | label family/colour; 4px padding | P2 |
| Reminder row | title `15px/700 #1f2612`; sub `12px/600 #8a9670;margin-top:3px` "Every day at 12:00 – 12:30 morning" / "Off"; toggle (Global) | title Newsreader 15.5 `#333c22`; sub 12.5 `#8a9670` ✓ copy; toggle fill is the CTA gradient | family/weight; toggle colour | P2 |
| Devotion-time block (02) | kicker `9.5px` (settings variant) `padding:6px 6px 0`; cards + panel identical to onboarding | `DevotionTime` reused — inherits every onboarding/05 finding; kicker 10 | see onboarding/05 | P1 |
| Language (03) | two cards `flex:1;padding:13px 14px;border-radius:16px;border:1.5px` — chip `30×30;border-radius:10px;11px/800` (EN / አማ), label `14.5px/700`; selected `#16200c` bg, `#F2F3E2` text, chip `rgba(169,200,106,.2)`/`#A9C86A`; idle `#fff`, `#5b6647`, chip `#eef1e2`/`#75844a` | one card with **two rows** ("App language", "Scripture language"), each a pair of pills `paddingVertical 10, radius 12, field bg`, selected `inkDeep`/`#F2F3E2`, 13px | layout (rows vs cards), chip missing; the extra scripture-language row is an app feature with no design | P1 |
| Account | rows `padding:15px 18px;15px/700` + `›` `#93a17a`; divider `#eef1e2`; "Delete my data" `#B4432B` | rows `13/14`, Newsreader 15.5, no chevron; divider `#dde3c4`; danger ✓ | chevron, family | P2 |
| Footer | "Restart onboarding" `12.5px/700 #5E7E33;padding:8px 14px` then "Abide 1.0" `11px/600 #a3ad8f`, `gap:8px;padding-top:6px` | version string only, 12 `#93a17a`, `marginTop 32` | **restart link missing** | P1 |
| Reminder off (04) | window block collapses; sub "Off" | same | — | ✓ |

---

## streak/03–06

**Verdict: P1 (P0 on the flame).** Ink surface and calendar match closely; the hero is
an emoji instead of the drawn flame, the count is small, and the message block is
absent.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Header | `padding:44px 20px 0`: back `38 rgba(255,255,255,.08) #A9C86A` + "MY STREAK" `11px/700 ls 2px #a3b573` | none (modal; `paddingTop 61`) | missing | P1 |
| Flame | `120×126` block `height:172px;margin-top:14px` — outer `94px` `linear-gradient(160deg,#F6BC45,#E8843C 55%,#C05A16)` rotated 45°, mid `60px #F6BC45`, core `32px #FBE8B8`; `flick1 1.4s`/`flick2 1.1s`; `drop-shadow(0 0 26px rgba(246,188,69,.65))`. Low: `scale(.58)`, `#C99450/#A5642A/#7c4514` cuts, slower flick. Out: `scale(.82)`, `#454f3e/#333c2d/#252d20`, no flick, 3 `smokeRise 3s` puffs | 🔥 emoji 56px; "·" when 0 | artwork, states, motion | **P0** |
| Count | `{{fNum}} 92px/1` — `#F6BC45` strong / `#D8A85C` low / `#7c8a70` out | Anton 64/68 `#F6BC45` in all states | 28px; state colours | P1 |
| Label | "DAY STREAK" `11px/800 ls 4px #a3b573;margin-top:4px` | "CURRENT" / "START TODAY" 10/1.6 `#a3b573` | copy, 2.4px tracking | P2 |
| Message | `{{fItalic}} italic 19px #f3f5e4;margin-top:14px;padding:0 40px;line-height:1.35` + sub `12.5px #93a17a;margin-top:6px;padding:0 44px;line-height:1.5` from `CFG_TXT` (strong/low/out) | absent | missing | P1 |
| Tiles | `gap:10px;padding:20px 20px 0`; tile `padding:14px 0 12px;border-radius:18px;rgba(255,255,255,.06);inset ring .06`; value `{{fNum}} 30px #f3f5e4`; label `9.5px/800 ls 2px #a3b573;margin-top:3px` "BEST STREAK" / "DEVOTIONS" | gap 12; tile `paddingVertical 16` 18r `.06`, no ring; Anton 30/34 `#F2F3E2`; label 10/1.6 `#7c8a63` "BEST" / "TOTAL DAYS" | copy, label colour | P2 |
| Repair card | none | amber card (accepted) | app | — |
| Calendar card | `margin:14px 20px 120px;padding:16px 14px 14px;border-radius:22px;rgba(255,255,255,.06)` + inset ring | 24r `.05` `padding 16`, gap 24 above | 2px radius, tint | P2 |
| Month header | ‹ › `32×32 rgba(255,255,255,.08)`, enabled `#A9C86A` disabled `#4a5640`; label `11.5px/800 ls 2px #f3f5e4` "NEHASE 2018"; sub `9.5px/600 #93a17a` "Aug 7 – Sep 5, 2026"; `padding:0 2px 12px` | same sizes/colours; label 11.5/1.6 `#F2F3E2`; sub 9.5 `#7c8a63`; `marginBottom 12` | tracking 0.4, sub colour | P2 |
| DOW heads | `8.5px/800 ls 1px #7c8a63;padding-bottom:6px;gap:2px` | 9.5 `#7c8a63` `marginBottom 2` | 1px | P2 |
| Cells | `padding:4px 0 3px;gap:2px;border-radius:10px`; number `9.5px/700` — read `#e8eed6`, missed `#c98a6a`, today `#D9E8A8`, future/old `#5a6749`; face 15px (smile `#A9C86A` / frown `#E0764A` / none); today `rgba(169,200,106,.16)` + `0 0 0 1.5px #A9C86A inset` | square cells 9r, number 9.5 `#a3b573` for every state, unscheduled `#4a5640`; faces 15 SVG ✓ (+ amber for repaired/backfilled, accepted); today ✓ | number colours by state | P2 |
| Footer | "22 of 27 days" `10px/600 #93a17a;margin-top:12px` | "22 / 27" 11.5 `#7c8a63` | copy | P2 |
| Two months back (04) | header "SENE 2018 / Jun 8 – Jul 7, 2026", ‹ enabled to 11 back, › enabled | same; correct | — | ✓ |
| Nav | design keeps the bottom nav on Streak | modal, no nav | presentation (accepted as a modal) | P2 |

---

## series-summary/01–02 · Series summary

**Verdict: P1 (header P0).** The app renders the summary day through the generic reader,
so the header is the reader's; the question cards are close.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Header | back 38 + "SERIES SUMMARY" kicker; title = **series name** `36px/1.06`; lede `{{fBody}} 15.5px/1.5 #5b6647;margin-top:8px` | reader eyebrow "NEHASE 7, 2018 · READ LATE", **Noto 700 36** title "Summary Questions — Study of the Book of Ruth", ☆; lede 16 Newsreader `#4a5436` | header structure, title font and copy | **P0** |
| Progress | bar `6px #e7ebd6` fill `linear-gradient(90deg,#8FB052,#5E7E33);margin-top:14px`; text `11.5px/800 #5E7E33` "2/4 answered" | bar 6 `#eef1e2` fill CTA gradient; text 10/1.6 `#75844a` "1/3 answered" | text colour/size | P2 |
| Cards | `gap:12px;padding:20px 20px 30px`; card `border-radius:20px;padding:16px 16px 14px;box-shadow:0 0 0 1px #dde3c4`; chip `28×28;border-radius:10px;12px/800` (answered `#D9E8A8→#8FB052`/`#16200c`, else `#eef1e2`/`#75844a`); question `16.5px/1.45 #333c22;padding-top:3px;gap:12px` | gap 12, `paddingHorizontal 24`; card 18r `padding 16` border 1; chip 26/9r Anton 13 (`#93a17a` idle); question Newsreader 16.5 `#1f2612` | radius, chip 2px, idle chip text | P2 |
| Textarea | `min-height:76px;border:none;background:#F3F5E6;border-radius:12px;padding:11px 13px;15.5px/1.5 #2c3318;margin-top:12px` "Write here…" | `min 76`, `#F3F5E6`, **border 1 #dde3c4**, 18r, `padding 12`, NotoSerif 16 | border, radius 6px, family | P2 |
| CTA | "Finish series →" 52/18 lime, `margin-top:6px` in the scroll | fixed footer with "Finish series" ink pill, or "✓ Completed" pill when done (captured state) | component; completed state is app-only | P1 |
| Two answered (02) | chips 1–2 lime, "2/4 answered" | data-dependent (app has 1/3) | content | — |

---

## series-summary/03 · Celebration

**Verdict: P2.** Built to v3.

| element | design | app | Δ | sev |
|---|---|---|---|---|
| Background | focus-family radial (light at 18%) | `InkBackdrop streak` (`#22300F→#0A1005`, light at 0%) | wrong family (streak vs welcome/focus stops) | P2 |
| Confetti | 5 fixed pieces: `10px #F6BC45` circle, `7px #A9C86A` circle, `12px #D9E8A8` square r3 rotated 20°, `8px #E8843C` square r2 −15°, `6px #F6BC45` circle; `floatY 3–4.4s` staggered | 12 circles 4–7px amber/lime, drift −18px + opacity over 7.6s | count, shapes, motion | P2 |
| Mascot | `110×162;mDouble 1.6s infinite;drop-shadow(0 18px 18px rgba(0,0,0,.4))` | `size 120`, custom two-hop 1.18s loop, no shadow | 10px, motion (see Motion) | P2 |
| Kicker | "SERIES COMPLETE" `11px/800 ls 4px #a3b573;margin-top:34px` | 10/4 `#a3b573`, `marginBottom 24` on the mascot | 1px, 10px gap | P2 |
| Title | `42px/1.05 #F2F3E2;margin-top:8px` | 42/44, `marginTop 8` | — | ✓ |
| Line | "Well done, Daniel." `italic 17px #a3b573;margin-top:10px` | 17, `marginTop 12` | 2px | P2 |
| Tiles | as streak tiles; `margin-top:28px;gap:10px`; PARTS / REFLECTIONS / DAYS | `marginTop 32`, gap 12; labels `#7c8a63` | 4px, colour | P2 |
| CTA + link | "Start the next series →" then "Back to devotions" `13.5px/700 #a3b573;padding:13px`; block `padding:0 24px 30px` | same; link 14.5 Newsreader; `paddingBottom 24` | family, 1px | P2 |

---

## Reflections tab (no reference frame)

Spec-only comparison (README §9, design markup `isReflect`). The app's Reflect tab has
the kicker "MY JOURNAL", title, count, search, series chips and a range row — the same
structure. Differences: chips use the app's chip style (Global); the range row lacks
"Custom range" and the two date inputs (P1); the date tag is `10.5px ls .3 radius 8`
vs `9px/800 ls 1.6px radius 20 padding 3px 9px` (P2); card radius 18 vs 20, padding 16
vs `15px 16px 16px 18px` (P2); title `f.subtitle` 21/25 ✓; body 15/1.5 `#4a5436` ✓;
empty copy "Your saved reflections will appear here." / "No devotions match those
filters." to verify against `OB.noRefl` / `LIB.none` (P2).

---

## Motion

Compared from the keyframes in MOTION.md against the app's Reanimated code, and — where
the app has an equivalent — against the timed frames. App frames were recorded with
`compare/motion.mjs` (screenrecord emits ~11 fps on this AVD, so app timings are ±90ms);
per-frame mascot centroids are in the numbers below.

| animation | design | app | Δ | sev |
|---|---|---|---|---|
| Mascot idle `floatY` | `4.5s ease-in-out infinite`: `translateY 0→-10px` with a constant `rotate(-3deg)` (frame `mascot-floatY-idle-mid`) | Today (`waiting`): bob `0→-5→0` over 2.8s (measured 1.95s→4.79s peak-to-peak) plus a held `-0.14rad` lean; Welcome/Celebration (`idle`): `0→-3→0` over 4.4s; no rotation | amplitude ½ / ⅓, period, tilt | P1 |
| Idle moves (`mHop` 1.2s, `mDouble` 1.6s, `mSwerve` 2s, `mTwirl` 2.2s, `mJelly` 1.4s, `mTilt` 2s, `mWink` 1.3s, `mStretch` 2.2s, `mStep` 2.4s×2), random every 10–20s on strong streak, one on tap | **none** (frames `mascot-hop-*`, `-jelly-*`, `-twirl-*`, `-side-step-*`) | missing | P1 |
| Press squish | `scale(1.1,.88)` in `.16s cubic-bezier(.34,1.56,.64,1)` on pointer-down; release to 1 (frame `mascot-press-squish`) | mascot is `pointerEvents="none"` | missing | P1 |
| Blink | `blink 5s`: `scaleY .1` at 96% | `withDelay(4400, 90ms→.1, 110ms→1)` ≈ 4.6s cycle | 0.4s | P2 |
| Sad idle `mascotSad` | `5.5s`: `rotate(-2.5deg)→(2.5deg)` **with `translateY 0→5px`** (frame `mascot-sad-idle-mid`) | tilt `±0.04rad` (±2.3°) over 3.6s, `translateY` held at 2 (measured 0–9 physical px ≈ 3.6dp wander) | period, the drop | P2 |
| Celebration `mDouble` | `1.6s`: `-12px` (12%), `0` squash `1.05,.92` (24%), `-14px` (36%), `0` squash (48%), `4px` `1.1,.84` (58%), **`-38px` `.92,1.12`** (75%), `0` `1.08,.9` (92%) — three hops, the last big (frames t0/192/576) | 1.18s loop: `-22` (190ms, measured −54 physical = −21.6dp at +110ms) → 0 → `-12` → 0 → hold 420ms; swell 1.06/1.04 | two hops not three, largest hop 22 vs 38, no anticipation squash, 26% faster | P1 |
| CTA `ctaGlow` | `3.4s` shadow pulse `0 10px 22px -12px rgba(143,176,82,.6)` ↔ `0 14px 30px -10px rgba(169,200,106,.9)` | static shadow | missing on every primary CTA | P1 |
| `riseFade` | `.35s` cards / `.5s` notification card, ribbon (`opacity 0→1, translateY 14→0`) | none | missing | P2 |
| Toggle | knob `.25s cubic-bezier(.34,1.56,.64,1)` (overshoot), track colour `.25s` | `withTiming 160ms` default easing; track swaps instantly | easing/duration | P2 |
| Time card select | `transform .2s cubic-bezier(.34,1.56,.64,1)` to `scale(1.02)`, `box-shadow .2s` | instant, no scale | missing | P2 |
| Progress bar | `width .4s ease` | width set directly | missing | P2 |
| Nav hide | `translateY(130px) .5s cubic-bezier(.4,0,.2,1)` + opacity `.4s` | no floating nav | see Global | P0 |
| Bible nav | hides on scroll-down `> 56px`, `dy ≥ 6` | top bar hides at `Δ > 12px` | wrong element | P1 |
| Streak flame | `flick1 1.1–1.4s`, `flick2 .8–1.1s`, `smokeRise 2.6–3s` (out) | emoji | missing | P1 |
| Lantern | `lanternFlick 1.3s` (`opacity 1↔.82`, `scale(1.06,.95)`), glow `0 0 20px 7px rgba(246,188,69,.55)`, enter `riseFade .6s` | missing | see Today | P0 |
| Focus timer start | `focusCtlGap` transition `.5s cubic-bezier(.4,0,.2,1)`, nav slides out, bar `width 1s linear` (frames `focus-timer-start-t0/t600`) | header unmounts, ring fills per second | screen is P0 | — |
| Confetti | `floatY` 3–4.4s, delays .3/.6/1/1.4s | 7.6s drift cycle, 12 dots | P2 | P2 |
| Glow pulse peak | `goldPulse 4s` (frame `reminder-glow-pulse-peak`) | N/A (variant) | — | — |

---

## Prioritised fix list

**P0 — structural**
1. Floating ink bottom nav (all tabbed screens), with hide/show transition.
2. Today: DayScene sky, flame button, gear, greeting block (rotating greeting + name,
   date, motivation), 150px mascot with streak-state faces, ink devotion card with
   "Begin study →", lantern signal + `begunToday`.
3. Focus: ink surface, Anton gradient timer, bar, 3 preset pills, play/reset controls,
   nav hide while running.
4. Reader: header (back/kicker/star), ref/title/meta order and faces, ink verse card +
   "Read the full chapter", Newsreader body, REFLECT card.
5. Type migration off `theme.font.*` (Noto) on Today, Bible, Focus, Library, Series,
   Reader, Summary header.
6. Library series card anatomy (icon tile, badge, arrow, gradient bar, pct, meta).
7. Streak flame artwork with strong/low/out states.
8. Summary screen header (series name title, kicker, lede).

**P1**
9. Bible header (kicker, Newsreader 34 title, ‹ › circles), verse type, bottom-nav hide.
10. Library: range chips + custom dates, flat-row anatomy, chip colours; Reflect range
    "Custom range".
11. Series detail header + row anatomy + pct; summary card details.
12. Code entry: active box without focus, filled-box colour, full-width accepted row.
13. Devotion-time cards: DayScene art, period word; panel row type/colours; summary row.
14. Notification card row layout + icon.
15. Settings: language cards, "Restart onboarding", chevrons.
16. Streak: header with back/kicker, 92px count with state colours, message + sub.
17. `ctaGlow` on every primary CTA; idle `floatY` amplitude/tilt; tap moves; press
    squish; celebration `mDouble` keyframes.
18. Welcome CTA vertical position (the removed link row).

**P2** — the token-level items in each table above (kicker 11/2px, card radii 20/22/24,
ring-vs-border, section gaps, toggle gradient and easing, chip sizes, tile label
colours, calendar number colours and footer copy, confetti shapes, backdrop stops,
`riseFade`, transitions).

---

# Phase 3 — after implementation

Re-captured 2026-09-04 with the same harness. Every screen below was rebuilt or
restyled; the numbers are from `compare/audit.mjs diff` on the same masked crops.

## Where the numbers landed

| ref | before | after | ref | before | after |
|---|---|---|---|---|---|
| core/01-today-strong-streak | 89.4% | **19.5%** | onboarding/01-welcome | 12.8% | **5.8%** |
| core/02-bible-john15 | 21.7% | 17.2% | onboarding/02-enter-code-empty | 3.6% | **3.7%** |
| core/03-bible-scrolled-nav-hidden | 13.4% | 19.9% | onboarding/03-code-partial | 3.8% | **4.1%** |
| core/04-bible-scrolled-up | 22.5% | 17.2% | onboarding/04-code-accepted | 12.3% | 14.1% |
| core/05-focus-idle | 94.1% | **22.0%** | onboarding/05-name-time-default | 22.6% | 28.9% |
| core/06-focus-running | 95.1% | **21.6%** | onboarding/06-name-time-evening | 22.8% | 28.5% |
| core/07-devotions-library | 19.6% | 16.3% | onboarding/07-notifications | 13.0% | 12.0% |
| core/08-devotions-completed | 18.1% | 13.7% | series-summary/01-summary-empty | 10.5% | **8.6%** |
| core/09-devotions-reflected | 18.7% | 13.8% | series-summary/02-two-answered | 11.5% | 11.3% |
| core/10-series-john | 19.5% | 20.3% | series-summary/03-celebration | 14.6% | 12.8% |
| core/11-reader-part2 | 22.2% | 47.5% | settings/01-top-reminder-on | 36.5% | 38.9% |
| core/12-reader-reflection-empty | 20.1% | 29.2% | settings/02-scrolled-time-cards | 53.6% | 53.2% |
| core/13-reader-today | 40.1% | 46.1% | settings/03-bottom-language | 37.5% | 42.1% |
| core/14-series-judges-complete | 19.6% | 19.2% | settings/04-reminder-off | 10.9% | 11.2% |
| today-states/01-streak-low | 90.1% | **17.4%** | streak/03-grid-a-weekday | 21.6% | 18.4% |
| today-states/02-streak-out | 90.1% | **21.6%** | streak/04-two-months-back | 21.7% | 18.5% |
| today-states/03-morning | 84.5% | **17.7%** | streak/05-low-12-days | 19.7% | 19.4% |
| today-states/04-evening | 93.9% | **16.1%** | streak/06-out-0-days | 18.3% | 16.7% |
| today-states/05-night | 86.4% | **11.2%** | today-states/09-5tab-nav | 89.9% | **20.6%** |
| today-states/06-lantern | 90.0% | **19.4%** | today-states/07, 08 | — | N/A (variant) |

Median across the 41 comparable screens: **18.5%**. The band above 80% is gone.

**The four screens that went up did so for a reason, and each is content rather than
layout.** The reader now renders the key verse's *text*, which the app previously did
not show at all — and only Amharic scripture is bundled, so an eight-line Amharic verse
sits where the design draws five lines of English. Everything below it shifts, and the
diff counts every shifted line. The two devotion-time screens and settings gained the
real `DayScene` art inside the four cards, which is four small pictures where there
used to be four flat gradients; the art is right and it disagrees with the reference in
every pixel that is not sky. Bible 03 moved because the bottom nav now hides on scroll,
so a bar that used to be in both frames is in neither at the same moment.

**Text still dominates the residue everywhere.** At 232px wide, two fonts rendering the
same sentence disagree on roughly a fifth of the page, and the app is showing the
ministry's real Ruth and Psalms content against a design mocked up with John and Judges.
Nothing below about 15% is a layout finding.

## What was built

**Shared** — `theme.ts` gained the design's full radius, tracking, shadow and colour
sets; `fonts()` gained an 800 cut (Archivo ExtraBold, newly bundled) and a medium UI
face. New: `ui.tsx` (Kicker, Title, Subtitle, Body, UiText, Numeral, PaperCard, InkCard,
Chip, ChipRow, ProgressBar, RiseFade, BackButton, ScreenHeader), `PrimaryButton` with
`ctaGlow`, `FloatingNav` + `nav-visibility`, `Icon` (the design's SVG set), `DayScene`,
`Flame`, `KeyVerseCard`, `DayRow`, `ranges.ts`, `v3-logic.ts`.

**Screens** — Today, Focus, the reader, the library, series detail, streak, settings,
the summary, the celebration, Welcome, the journal, and all three onboarding steps.

**Motion** — `floatY`, `mascotSad`, the nine moves with their keyframe percentages, the
idle scheduler, tap-to-play, press squish, `mDouble` on the celebration, `ctaGlow`,
`lanternFlick`, `flick1`/`flick2`/`smokeRise`, `riseFade`, the toggle spring, the
progress bar and the nav's slide.

## Decisions taken on the five open points

1. **Key verse text** — rendered from the bundled scripture database when the reader's
   language has one, reference-only when it does not. English is not bundled.
2. **Save button** — autosave kept; the button flushes the pending write and confirms.
3. **Focus presets** — the design's 5 / 15 / 25.
4. **Streak labels** — the design's DAY STREAK / BEST STREAK / DEVOTIONS.
5. **Part of day** — the hero uses the design's boundaries (5/12/17/21) from the device
   clock; the reminder window keeps `partOfDayForMinute`, which mirrors the database
   trigger.

## Two implementation findings worth recording

**`rotateY` does not render on a view whose content is an SVG canvas (Android).** The
twirl spun a character that never got narrower. `scaleX = cos θ` is the projection of a
turn about the vertical axis for flat art, and it renders: measured 160 → 124 → 155 →
164 across the spin.

**An SVG sized in percentages inside a content-sized box lays out at nothing.** The key
verse card painted a dark strip under its label and left the verse white on white. It
now measures its own layout and paints a solid base underneath, so it is never
unreadable even before the first layout pass.

## What is left

- **P1** — settings/02 and /03 are still scroll-position comparisons rather than layout
  ones; the scroll offsets need one more pass. The Bible screen keeps its own top bar
  rather than the design's kicker-and-arrows header.
- **P2** — the residual 5–10px vertical drift on onboarding and settings, from row
  heights that differ by a point or two; the twirl's mirrored half (`scaleX` goes
  negative through the far side, which the design's real rotation also does); the glow
  and ribbon reminder variants, not built by decision.
- **Not comparable** — English scripture is not in the bundled database, so the reader
  and Bible screens cannot be diffed against English references until it is licensed.

---

# P1 follow-up

Both P1 screens rebuilt, and one bug they exposed fixed across the app.

| ref | before P1 | after P1 |
|---|---|---|
| core/02-bible-john15 | 17.2% | **15.1%** |
| core/03-bible-scrolled-nav-hidden | 19.9% | **12.1%** |
| core/04-bible-scrolled-up-nav-back | 17.2% | **15.4%** |
| onboarding/01-welcome | 5.8% | **4.7%** |

Median across the 41 comparable screens: **16.6%**, from 18.5%.

## Bible

Rebuilt to the design: paper gradient ground, a header that stays put — kicker
("HOLY BIBLE · NIV" / "· AMHARIC"), Newsreader 34 title, two 36px ink circles for
chapter steps — and scripture set as prose at 18.5/1.66 in `#262c17`, each verse its own
paragraph with the number set into the first line in Archivo ExtraBold lime.

Two departures from what was there:

- **The bottom nav hides, not the header.** It was the wrong way round. The header
  carries which book and chapter you are in, which is the one thing a reader loses track
  of; the tab bar carries nothing while you are reading. Now on the shared
  `NavVisibilityContext`, so it uses the same slide as Focus.
- **Text size and bookmark moved into the kicker row.** The design has no counterpart
  for either, and putting them beside the chapter arrows would have made four circles
  competing for one corner. The kicker row was otherwise empty.

The picker, search, highlight and prev/next pager keep their behaviour, restyled to the
design's chips and cards.

## Sign-in

No design frame exists — the design assumes a code is the whole of joining. Dressed in
the onboarding chrome anyway: paper ground, the same ink language pill, kicker, 36px
title, white 18-radius fields, and the shared lime button, because it is the first paper
screen a new member sees and an unstyled one there reads as a different app. Reachable
in audit mode via `noRedirect`, so it can be captured.

## The bug both screens exposed

**A `({ pressed }) =>` style function on a Reanimated `AnimatedPressable` is dropped when
none of the resolved entries is an animated style.** That is exactly the disabled case,
and it left `PrimaryButton` with no height, no fill and a left-aligned label — visible on
sign-in, where the button starts disabled and there is nothing else in the footer to
hide it. It was latent on every disabled primary button in the app.

`PrimaryButton` now takes a static style array and drives the press from a shared value
through `onPressIn`/`onPressOut`, so the press runs on the UI thread with the rest.
Verified: the disabled button paints `#e2e6cf` edge to edge with a centred `#93a17a`
label, and `onboarding/02` is unchanged at 3.5%.

## Noto

`theme.font.*` and the five Noto files now have exactly one referent left:
`src/components/ComingLater.tsx`, which nothing imports. Deleting that dead component
clears the last reference and the fonts can come out with it — left for the P2 pass
rather than done here, since removing bundled assets wants its own rebuild and re-verify.

---

# P2 follow-up, and the final position

## What changed

**Noto is gone.** `ComingLater.tsx` — dead code, imported by nothing — was the last
referent of the `theme.font.*` keys. It, the five Noto Ethiopic files and the flat font
map are all deleted. Every screen now names its faces through `fonts(language)`, so a
face cannot be picked without knowing which script it is for. 1.3 MB out of the bundle.

**Text boxes are deterministic.** Every primitive in `ui.tsx` sets an explicit line
height (1.2 for Latin, 1.45 for Ethiopic, which needs the room its ascenders use) and
turns off Android's font padding. Left alone, a `Text` measures taller than its own line
height by whatever the face's metrics ask for — nothing once, eight points down a page
that stacks five labels.

**The settings captures were comparing the wrong page.** `settings/02` and `/03` are not
scroll positions: the design's three settings frames are three crops of the same
unscrolled screen. The capture script was swiping before shooting, so the app was being
diffed against a page it was not showing. It now shoots all three from the top, and
waits for the preferences fetch that gates the render — the first two shots were landing
on the loading spinner.

**The journal was verified.** No reference frame exists for it, so it is captured as its
own baseline (`compare/app/_check/reflect-en.png`). It renders correctly on the shared
chips, range row, amber date tags and cards.

## The numbers

39 screens with a built counterpart (excluding the glow and ribbon signal variants,
which were not built by decision):

| | |
|---|---|
| median | **16.3%** |
| mean | 18.2% |
| best — `onboarding/02-enter-code-empty` | 3.5% |
| worst — `core/13-reader-today` | 41.9% |
| under 20% | 29 of 39 |
| under 15% | 17 of 39 |

Started at a median around 20% with seven screens above 80%. Nothing is above 42% now.

**What the residue is, and why it is not layout.** Two measurements settle it.

`settings/01` sits at 37.9% while `settings/04` — the same screen with the reminder
toggled off — sits at 13.1%. The only difference between them is the block of four
devotion-time cards. Those cards are four rendered sky scenes; they are in the right
place at the right size with the right art, and they disagree with the design's own
rendering in almost every pixel that is not flat sky. That one block accounts for
roughly 25 points on its own.

The same holds for the reader: `core/13` is at 41.9% because the key-verse card now
renders eight lines of Amharic scripture where the design drew five of English, and
everything below it shifts. `core/11`, whose day has no key verse, sits at 20.0%.

Below about 15% the difference is text: at 232 px wide, two font stacks setting the same
sentence disagree across a fifth of the page, and the app is showing the ministry's real
Ruth and Psalms against a design mocked up with John and Judges.

## Element-level conformance

The pixel percentages measure the picture. The audit's own findings measure the design.
Phase 1 recorded **154 differences** across the sixteen screen sections and motion, of
which 131 carried a severity grade (19 P0, 50 P1, 62 P2).

By my classification, verified by capture wherever a capture could show it:

| | count | |
|---|---|---|
| **Resolved** | ~132 | every P0, every P1 but one, and most P2s |
| **Accepted by decision** | ~12 | the eight pre-agreed divergences, plus ring-vs-border, the ink radial's 2% light offset, the Ethiopian date on Today, and the "Reflect" tab label |
| **Outstanding** | ~10 | listed below |

That is **~93% of the gradeable findings resolved**, or ~86% counting the accepted
divergences as unresolved. Every P0 is closed.

## What is still outstanding

**Platform limits, unlikely to move**

- Bible verse numbers sit on the baseline rather than raised. React Native has no inline
  superscript; the design's `vertical-align: 6px` has no equivalent.
- The Focus timer has no `glowPulse`. It is a `drop-shadow` on glyphs, which React
  Native cannot animate.
- The twirl's far half renders mirrored, because a Y-rotation is projected as a negative
  horizontal scale. A real rotation would do the same thing; the design's does.

**Small and deliberate**

- Settings still sits about 8 px low and gains about 8 px per section. Both line-height
  and font-padding fixes were tried and neither moved it, and the reference itself
  carries ±3 px at 0.63 scale — so chasing below ~5 px is fitting to measurement error.
- The custom date range is two typed ISO fields rather than a native picker. A picker is
  another native dependency.
- The time-card selection has the design's `scale(1.02)` but not its spring.

**Not built, by decision**

- The glow and ribbon reminder variants (lantern was chosen).
- Streak calendar grid variant *b* (the app uses *a*).

**Blocked**

- English scripture is not in the bundled database, so the reader's key-verse card and
  the whole Bible screen can only be compared against Amharic.
- Amharic type has not been audited at all. Everything above is English.
