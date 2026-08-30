# Build phases

Ordered so the licensing gates sit late and isolated. Phases 0–5 deliver a genuinely
usable app with no dependency on either permission landing. Full reasoning in
[SPEC.txt](SPEC.txt).

| # | Phase | Done when | Status |
|---|-------|-----------|--------|
| 0 | Foundations | A test user can sign in on device and the RLS policy denying admin access to reflections has a passing test | **done** |
| 1 | Content pipeline | All three supplied books are in the database with every resolvable reference canonicalised | **done** |
| 2 | The core loop | A user can complete, break, backfill and repair a streak, and the server agrees with the client | **done** |
| 3 | Offline & sync | A week in airplane mode reconnects to correct state, on a device with a wrong clock | next |
| 4 | Library & reflections | Every path to a devotion works and future books are provably invisible | |
| 5 | Admin dashboard | The ministry can author and publish a book without an engineer | |
| 6 | Notifications | Every rung of the ladder fires in a simulated month and the two-per-day cap holds | |
| 7 | Bible reader *(gate 1)* | Every validated cross-reference resolves and opens | |
| 8 | Focus & prayer | DND engages and reliably restores, including on force-kill | |
| 9 | Character & polish *(gate 2)* | No proprietary font remains and Amharic layouts survive the metric change | |
| 10 | Hardening & launch | Both gates cleared in writing, a real cohort has run a full book | |

## Phase 0 — what was built

**Monorepo.** pnpm workspaces: `apps/mobile`, `apps/admin`, `packages/domain`.

**Shared domain types** (`packages/domain`). Branded ids, the bilingual entity types,
the canonical `ScriptureRef` shape, the completion rule as pure testable functions,
and the `RepairRule` interface the streak engine will consume in Phase 2. Rules that
belong to the product rather than to a screen live here so the app, the admin, and
the importer cannot disagree about them.

**Database** (`supabase/migrations`). The full schema — tenancy, content hierarchy,
progress and the append-only streak ledger, and the configuration tables Phases 5–8
will fill in. Every content and progress table carries `church_id` from day one.

Two constraints encode decisions rather than mere hygiene:

- `devotion_days_one_per_date` — a unique index proving the ministry moves together.
- `check (method <> 'backfill' or counted_for_streak = false)` — backfilling can
  never quietly restore a streak, whatever a future caller believes.

**RLS** (`20260830000500_rls.sql`). Own-row-only across all progress tables; content
readable only when published and scheduled on or before today in EAT, which is what
makes future books invisible. Reflections are restricted to their author with **no
admin bypass policy**. Admin engagement numbers come from the `ministry_engagement`
SECURITY DEFINER function, which returns counts and has no column that could carry a
reflection body.

Neither app holds a service-role key, and that is deliberate — one would step over
every policy above.

**Apps.** Expo skeleton with expo-router, a Supabase client wired to AsyncStorage
session persistence, a sign-in/join-code screen, and a Today placeholder that reads
the current day through RLS. Next.js admin skeleton with a browser client. Both are
scaffolding: the real screens are Phases 2–5.

**CI** (`.github/workflows/ci.yml`). Typecheck and unit tests on one job; on the
other, a fresh Supabase, the pgTAP suite, and a from-scratch migration replay.

### Verified

- `pnpm typecheck` — clean across all three workspaces.
- `pnpm test` — 7 domain tests pass.
- `pnpm db:test` — 9/9 pgTAP assertions pass, including *"an admin cannot read
  another member's reflection"*.
- Signup → `redeem_join_code` → read `devotion_days`, exercised against the running
  stack: the new member saw exactly the days scheduled on or before today in EAT and
  none of the future ones, and could not read `join_codes` at all.

### Verified on device

Confirmed running in Expo Go on a real phone. The app targets **SDK 54**, matching the Expo Go build currently on the Play Store
(client 54.0.8). Expo Go only runs its own SDK, so this pin has to move in step with
that app rather than with npm's `latest` — check the installed client before bumping
it. The dev server's manifest advertises `exposdk:54.0.0` and serves a 7.4 MB
bundle, and Supabase's local API answers on the LAN, so both halves of the device
path are known good from this machine.

### Deferred, deliberately

- **Auth methods** (Q12) stay open. Email + password is the development default, and
  everything provider-specific is confined to `app/sign-in.tsx`.
- **Registration gating** (Q13) is assumed to be a join code, because tenancy has to
  come from somewhere at signup. Swapping it means replacing one function,
  `redeem_join_code`.
- **The iOS Screen Time entitlement** is a Phase 0 item in the spec, but it is a form
  the ministry files, not code. It has not been applied for. It is weeks of lead
  time — start it now.

## Phase 1 — what was built

**`packages/content`** — one parser, shared by the importer now and by the Phase 5
admin import UI later, so the browser and the CLI can never disagree about what a
reference means.

**The lexicon** is generated from the lists already proven correct in
`tools/validate_refs.py`, so the two cannot drift apart by transcription error: 66
books, Amharic and English names, plus the abbreviations the ministry actually uses.

**The verse index** (`data/verse-counts.json`) is built by streaming both bundled
XML texts and keeping only *counts* — no scripture text enters the repo's generated
output, which keeps the validator usable whichever way the Biblica request lands.
The two translations disagree on exactly one chapter (3 John 1: 15 verses in the
Amharic, 14 in the NIV), so the validator accepts a reference valid in either.

**The parser** handles what the source data actually contains rather than what a
citation standard says it should: both Ethiopic and ASCII separators, parenthesised
passages, missing spaces, cross-chapter spans, and — the part that matters —
inheritance. `ሉቃ 1:80፣ 2፡52` must resolve to Luke 2:52. Read without inheritance it
becomes 1 Timothy 2:52, which does not exist, and a reader would be sent to a blank
screen. That case is a test.

Nothing is silently corrected. A suggestion is recorded for review and the reference
is imported as written.

**Summary-day synthesis.** Each book's closing questions become a real day with
`kind='summary'`, so the round is 56 scheduled days, not 53. Getting this wrong
would have made every round short by one day per book.

**The importer** is idempotent on natural keys, because content will be re-imported
every time the ministry corrects a reference. It is the only thing in the repo that
uses a service-role key — it is a build tool, not an app.

### Verified

- 25 content tests, 32 across the workspace; pgTAP still 9/9.
- `validate` finds **exactly the six** references in `CONTENT_ISSUES.md` — no more,
  no fewer. A test pins that number, so a parser regression or a ministry fix both
  show up as a failure rather than silently.
- Imported into a fresh database: 3 books, 56 days on 56 distinct dates, 10 summary
  questions. Re-running leaves the counts unchanged.
- Through the app's own anon key: today resolves to Psalms day 21, 32 of 56 days are
  visible and the future ones are not, and only the summary questions of a book
  whose summary day has passed come back.

### Still waiting on the ministry

The six references in [CONTENT_ISSUES.md](../CONTENT_ISSUES.md) and
[content-report.md](content-report.md). Three are punctuation slips with a proposed
fix; three need the ministry to supply the intended reference. None block Phase 2 —
they import as written and are flagged.


## Phase 2 — what was built

**The streak engine exists twice, on purpose.** The client needs an instant answer
so the ✓ lands the moment it is tapped; the server needs an authoritative one that a
tampered device cannot influence. `computeStreak` in `packages/domain` and
`recompute_streak()` in the migrations implement the same rules independently.

Two implementations can drift, which is exactly what Phase 2's exit criterion is
about. `test/streak-parity.test.ts` seeds ten scenarios into a real database, asks
both engines, and compares. Mutating one engine by a single character (`<` to `<=`
on the missed-day boundary) turns two scenarios red, so the test has teeth. When the
stack is not running the suite **skips loudly** rather than passing vacuously — a
green tick that proved nothing would be worse than no test.

**The rule that does the work:** the streak counts consecutive *scheduled days*, not
consecutive calendar days. Gaps between books, unpublished rounds, and the round
boundary all fall out of that one sentence instead of needing three special cases.

**Backfill and repair stay distinct**, which the spec flags as where bugs will live:

| | Marks the day read | Restores the streak |
|---|---|---|
| Backfill | yes | **no** |
| Repair | yes | yes |

The method is chosen by the server from the day's own date, not passed by the
client, so there is no request that asks for a `live` completion on a past day. The
`check (method <> 'backfill' or counted_for_streak = false)` constraint from Phase 0
is the second line of defence.

**Repair is a plugin.** `double_up` (today done, missed day within 48h, free) and
`monthly_credit` (one a month, reaches back a week) implement the `RepairRule`
interface and never write — they return events for the engine to append. The
database enforces only what it can prove; adding or removing a rule does not touch
streak maths.

**Screens.** Onboarding (join code → language → part of day), Today with the round
header and flame, devotion detail with the timer and scroll tracking, the summary
day, and the streak screen with the Ethiopian-calendar grid.

Done is always tappable. If the bar is not met it opens a soft confirm and records
`confirmed_early` — analytics signal, never a penalty. Reading time counts only
foregrounded seconds and is checkpointed to local storage every 10s, so an app kill
mid-devotion does not reset progress.

**Calendar.** kenat (MIT, maintained) rather than hand-rolled arithmetic, wrapped in
`packages/domain/src/ethiopic.ts` so the Phase 5 admin scheduling calendar reuses
it. Month lengths are measured as the gap between successive months' first days, so
the leap rule stays the library's business. Pagume renders as the short partial row
it actually is.

### Verified

- 39 domain tests, 64 across the workspace; pgTAP now 25/25 across two files.
- Ten parity scenarios agree between client and server, including gaps, late
  joiners, backfill, repair, and best-preserved-after-collapse.
- The whole loop driven through the API as the app drives it: complete today →
  streak 1; backfill a day from three days ago → still 1, method `backfill`; repair
  yesterday with `double_up` → 2; `double_up` refused beyond 48h; `monthly_credit`
  spends its one credit and refuses a second.
- Android bundle exports clean with the new screens and the calendar library.

### Not verified

The screens have not been walked through on a device this phase — the loop is proven
through the API, and the bundle builds, but nobody has tapped Done on a phone yet.
Worth doing before Phase 3 builds offline sync on top of it.

### Deferred, deliberately

- **Five-tab navigation.** The spec's tab bar (Today · Devotions · Bible · Focus ·
  Reflect) waits for Phases 4, 7 and 8 to have screens to put in it. Today is the
  root and the streak opens from the flame; a tab bar with three placeholders would
  be scaffolding pretending to be a product. The open question about Amharic labels
  at 392px is still open, and is a Phase 4 decision.
- **Reflections** are Phase 4. The detail screen has no reflection box yet.
- **Cross-references are not tappable.** There is no reader to open until Phase 7,
  so they render as chips.
- **Greetings and motivations** come from `content_strings`, which the admin fills in
  Phase 5. Today shows a fixed greeting until then.
