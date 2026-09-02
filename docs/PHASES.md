# Build phases

Ordered so the licensing gates sit late and isolated. Phases 0–5 deliver a genuinely
usable app with no dependency on either permission landing. Full reasoning in
[SPEC.txt](SPEC.txt).

| # | Phase | Done when | Status |
|---|-------|-----------|--------|
| 0 | Foundations | A test user can sign in on device and the RLS policy denying admin access to reflections has a passing test | **done** |
| 1 | Content pipeline | All three supplied books are in the database with every resolvable reference canonicalised | **done** |
| 2 | The core loop | A user can complete, break, backfill and repair a streak, and the server agrees with the client | **done** |
| 3 | Offline & sync | A week in airplane mode reconnects to correct state, on a device with a wrong clock | **done** |
| 4 | Library & reflections | Every path to a devotion works and future books are provably invisible | **done** |
| 5 | Admin dashboard | The ministry can author and publish a book without an engineer | **done** |
| 6 | Notifications | Every rung of the ladder fires in a simulated month and the two-per-day cap holds | **done** |
| 7 | Bible reader *(gate 1)* | Every validated cross-reference resolves and opens | next |
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


## Phase 3 — what was built

**Every screen now reads from a local SQLite database.** Nothing renders from a
network response. The network only ever fills the database in the background, which
is what makes a week in airplane mode ordinary rather than a special mode with its
own code paths.

**The outbox.** Writes land locally and queue; the queue flushes when there is a
network. Every item carries a client-generated UUID, so the server recognises a
retry and treats it as a no-op — at-least-once delivery without double-applying.
Items the server refuses *on its own terms* are dropped rather than retried until
the end of time; items that failed for network reasons keep their place and count
an attempt.

Flush runs before pull. If a completion is queued and we pulled first, the pull
would return content that does not know about it and the UI would visibly flicker
backwards then forwards.

**The clock problem, and what the server can actually prove.** A phone that has been
offline for a week and a phone with its clock wound back look identical: both send a
timestamp claiming a past day was read on its own date, and a timestamp is just a
number the device chose.

The server cannot distinguish those by inspecting the claim. It can prove exactly
one thing — **when that device last reached it**. If the claimed date is *before* the
last successful sync, the device was online after that date and did not report the
completion then, so the claim is false. That is `plausible_live_claim`.

A false claim is **downgraded to a backfill, not rejected**: the reading is still
recorded and still shows a ✓, the user simply does not get the streak. Refusing it
outright would punish the honest offline case the moment the heuristic was wrong.

**Conflicts resolve last-write-wins on `updated_at`**, per the spec. The realistic
conflict is one person editing the same reflection on two devices, and silently
keeping the newer text is the right cost/benefit.

**Repair is the one thing that cannot happen offline**, and the screen says so
rather than offering a button that will fail: spending a credit is the server's
decision, not a local one.

### Verified

- pgTAP 37/37 across three files, including a genuine offline week, a retried
  flush, and a wound-back clock.
- `pnpm check:offline` drives the same paths **over HTTP with the app's own payload
  shape**, which pgTAP cannot — it calls the functions directly and never sees the
  wire. Seven days queued offline flush to a streak of 7; the identical batch
  replayed skips all seven and creates no duplicate rows; a backdated claim is
  recorded as a backfill and leaves the streak at 7; a delta pull returns 0 content
  rows and 8 progress rows. Both now run in CI.
- 64 unit tests, lint and typecheck clean, Android bundle exports.

### A bug this phase found in its own code

The effect that clears local data on sign-out originally ran whenever `session` was
null — which includes the moment before a stored session has been restored. It wiped
the entire offline cache on **every cold start**, and would have been invisible
except in exactly the situation this phase exists for: launching with no network. It
now watches for a real change of user.

### Not verified

Not yet exercised on a device with the network actually turned off. The server
contract is proven end to end and the local layer is straightforward, but "put the
phone in airplane mode for a week" is a claim only a phone can settle. Worth a
manual pass: read a day in airplane mode, confirm the ✓ and the queue notice, then
reconnect and watch the flush in the log.

### Deferred, deliberately

- **The Bible text** stays out of the local database until Phase 7. It is the only
  large asset, it never changes, and it ships bundled read-only rather than synced.
- **Reflections and favourites** have server-side sync and local tables, but no UI
  until Phase 4 — the sync path for them is tested, not driven.
- **Background sync** happens on launch and on foreground, as specified. No
  background fetch task; that is a notifications-era concern.


## Phase 4 — what was built

**The tab bar, all five of it.** Today · Devotions · Bible · Focus · Reflect. Bible
(Phase 7) and Focus (Phase 8) are honest placeholders that say so. They are here now
rather than later because the spec's open question — whether the Amharic labels fit
at 392px — cannot be answered with three tabs, and discovering the answer while
building Phase 8 would mean redesigning navigation at the worst possible moment.

The Amharic labels use short forms (መጽሐፍ, not መጽሐፍ ቅዱስ) at 10px rather than 11.
**This still needs a look on a real 392px screen** — if it overflows, the spec's
fallback is to move Bible out of the tab bar.

**The library.** Book listing with progress, or a flat result list the moment any
filter or search is applied. Filters are all · completed · unread · reflected ·
favourites, plus date bounds.

**Amharic search folds Ethiopic homophones.** ሀ/ሃ/ኀ/ሐ, ሰ/ሠ, ጸ/ፀ, አ/ዐ are typed
interchangeably, and without folding, search simply appears broken to a native
speaker — the kind of bug nobody reports, they just stop using the feature. Folding
is applied to the text and the query alike, and search covers both languages
regardless of the UI setting, because someone reading in English may well remember
an Amharic title.

**Reflections are per question.** A devotion has one; a summary day has one per
question. That needed the key to include the ordinal, both in Postgres and locally —
otherwise answering question 2 would overwrite question 1. The field saves itself
after a pause rather than on a button, since reflections are optional and never a
completion condition.

**Favourites** toggle from the devotion header, queued through the same outbox.

### A visibility bug the exit criterion caught

`visibility.test.sql` tests "future books are invisible" at four doors: a direct
table read, the sync payload, guessing a day's id, and completing it. It failed on
first run — **a day marked published inside a book still in draft was readable**.
The book was correctly hidden; its contents were not. The library listing happened
to hide it (it lists books, and that book was invisible), but any filtered view
reads days directly and would have shown unpublished content to the ministry.

Fixed in three places, because three separate paths reach a day: the RLS policy, and
the two SECURITY DEFINER functions that bypass it — `streak_days` and
`pull_content`. A day nobody may read is also a day nobody may complete.

### The Phase 3 coverage gap, closed

Phase 3 ended with a bug that every test missed, because they all covered the server
contract — which was correct — while the client's SQL was unreachable outside a
device. `apps/mobile/test/local-sql.test.ts` now runs **the app's own schema and
query strings** against a plain SQLite: not a re-creation, which would drift, but
the same exports the app executes. It pins the inner-join regression, the outbox's
unique client id, and per-question reflection keys.

### Verified

- 86 unit tests (53 domain, 25 content, 8 mobile), pgTAP 47/47 across four files,
  offline sync end to end, lint and typecheck clean, bundle exports.

### Not verified

Nobody has tapped through the new screens on a device. The tab-label question in
particular is a visual judgement that only a 392px screen can settle.

### Deferred, deliberately

- **Date-range filter UI.** The filtering logic takes bounds and is tested, but the
  library exposes only the status filters and search — a date picker is a lot of
  screen for a feature the spec lists last. The plumbing is there when it is wanted.
- **Reflection export** stays out, per the spec: private, no sharing, no export in
  v1.


## Phase 5 — what was built

Built in the spec's own priority order, which puts authoring first and stops at the
point the ministry can run a round unaided. Notifications and broadcasts are Phase 6;
engagement beyond a completions chart, content strings and app-icon rules are lower
in that same list and are not here.

**The bilingual editor.** English and Amharic in adjacent panes, so a translator sees
both at once, with a visible *Incomplete* mark the moment either side is empty. The
app has no fallback chain by design, so a missing translation has to be caught here
rather than degrading silently in someone's hand.

**References validate live**, against the same parser and verse index the importer
uses — `@abide/content`, not a re-implementation. Typing `ዘዳ 18:23` tells the editor
that Deuteronomy 18 has 22 verses while they are still looking at the field, rather
than after a reader taps a dead cross-reference.

**The import UI** runs the same `prepareBundle` as the CLI, so the report in the
browser is the report the import produces. Nothing is written until Commit, and what
is written arrives as a **draft** — publishing stays a separate, deliberate act.

**The schedule** is an Ethiopian-calendar month grid with the Gregorian date beneath
every cell. Gaps are drawn as gaps rather than skipped, and the screen warns when the
round is within three days of running out — the spec's own note that this is where
the admin becomes a single point of failure, because every reader hits "coming soon"
on the same morning.

**No service-role key exists in this app.** Every read and write is the signed-in
admin's own session under RLS, which is what keeps reflections unreadable. The
overview reports engagement through `ministry_engagement`, a function with no column
that could carry a reflection body.

### Two bugs the exit criterion caught

**Role changes silently did nothing.** `profiles` is self-update only — correctly, so
nobody can edit another member's language or join date — but the Users page offered a
role dropdown that RLS would refuse without saying so. Fixed with a narrow
`set_member_role` function rather than a broad update policy: it can set one column,
on a member of the caller's own ministry, and it refuses to let an admin demote
themselves, which with a single admin would lock the ministry out of its own
dashboard.

**A day could not be scheduled on an occupied date** — which turned out to be the
`devotion_days_one_per_date` index doing exactly its job. The ministry moves together;
the test was wrong, not the constraint.

### Verified

`pnpm check:admin` drives the dashboard's real write path as the admin's own session:
author a round, book and day → a member sees nothing while it is a draft, nothing
while it is in review, and the day the moment it is published. It also confirms the
privacy boundary properly: an admin is a reader too, so the test is not "sees no
reflections" but "sees none of anyone else's" — while the aggregate still returns
numbers. Now in CI.

47 pgTAP, 86 unit tests, lint and typecheck clean, `next build` clean.

### Walked through in a browser

Signed in, opened every screen, and changed a role — which confirmed the
`set_member_role` fix works from the UI rather than only in theory. Four things the
walkthrough found, all fixed:

**The ministry's own text was being lost.** Ruth day 2 reads `ዘፍ 24፡58 ፤ ኢሱ 24፡15`,
where the second half is a typo for ኢያሱ. Only parseable references were stored, so
the editor showed "Genesis 24:58" and no sign that anything was missing — the exact
outcome the spec's `raw` field exists to prevent, hidden from the one person able to
fix it. Days now keep each reference field as written, and the editor flags it live:
*ኢሱ 24:15: Not a book of the Bible.*

**Every book claimed one incomplete day.** Summary days have no purpose or prayer by
design — their content is the closing questions — but the completeness check judged
them as devotions. A warning that is always on is a warning nobody reads.

**The sidebar scrolled away** on a fifty-row day list. Now sticky.

**The schedule had no marker for today**, leaving an admin to count cells in a month
of identical ones.

### Deferred, deliberately

- **Notifications and broadcasts** are Phase 6, where the sending exists to test them
  against.
- **Content strings** (greetings and motivations) — Today shows a fixed greeting until
  they can be edited.
- **App icon rules** and **drop-off analytics** are last in the spec's priority list
  and wait for real usage to make them meaningful.
- **Creating a book from scratch in the UI.** Import covers how content actually
  arrives today; a blank-book form is worth building once the ministry asks for it.


## Phase 5 — dashboard revamp

Reviewed in a browser, then rebuilt on four answers: warm-but-utilitarian, a
schedule that answers both "are we covered" and "what about this day", all four
metric groups on the Overview, and a desktop-first audience of one or two admins.

**Two layout bugs, one cause.** `.main` carried `max-width: 1100px` inside a flex
row, so on a 1900px screen every page was pinned left with a third of the display
empty — and the sign-in card centred inside that column rather than the viewport.
The cap is gone (measured: content now spans 216→1585 of 1600), and sign-in centres
on the viewport with equal 630px margins because it has no navigation to sit beside.

**The schedule answers two questions.** A runway strip draws every scheduled day of
the round as one cell in order, so an approaching end or an unpublished stretch is
visible without counting. Four stats above it — runway, delivered, still to come,
unscheduled — and the Ethiopian month grid below, where past days are sunk, today is
outlined, unscheduled dates are dashed, and a day in an unpublished book is amber.

**The Overview leads with numbers that are doors.** Each metric card links to the
page that explains it, and the two that can go wrong — runway and things needing
attention — turn amber then red on their own. Beneath: daily reads, streak
distribution, drop-off within each book, and membership with the language split.

**Drop-off needed new plumbing, not a new query.** Progress tables are own-row-only
under RLS, so an admin genuinely cannot count completions — that is the privacy
design working. Four counts-only `SECURITY DEFINER` functions were added
(`ministry_dropoff`, `ministry_streaks`, `ministry_membership`, `content_health`),
none with a column capable of carrying a reflection body or its author.

The navigation now carries a count beside Books and Schedule when something needs
attention, so an admin does not have to open every page to discover it.


## Phase 5 — content management, not just content review

Import was a peer of Books in the navigation, which had the model backwards: import
is *a way of creating* books, not an alternative to them. The two are now one
**Content** section shaped like the domain — phase → round → book → day — with
creation at every level and import as a button inside it.

**A phase stays a code on the round, not a table of its own.** The ministry's own
exports treat it that way (`phase: "03"`, `round: "01"`), and everything a phase
might carry — the main verse, the start date — already belongs to the round. Typing
a code that does not exist yet is how a phase comes into being; existing codes are
offered as suggestions. If phases ever need their own titles, that is a table and a
migration, and worth doing then rather than speculatively.

**What can now be done without an engineer or a JSON file:** create a round under any
phase, add books to it, add days to a book (devotion or summary), write both
languages, fix references with live validation, assign consecutive dates from a
chosen start, and move each piece through draft → in review → published.

Scheduling reports a clash rather than skipping it: only one day may occupy a date
per church, because the ministry moves together, so a start date that overlaps an
existing round is refused with the reason.

Publishing a book now warns about unscheduled days as well as missing translations —
an unscheduled day is invisible to readers, which is a surprising way for a published
book to behave.

### Verified in the browser

Created phase 04 → round 01 → "Study of James" through the UI, confirmed all three
landed as drafts in the database, then removed the test data. `check:admin` and the
pgTAP suite still pass.


## Phase 5 — phases as records, and delete protection

Phases became real. A phase was a code on the round, which meant it could be brought
into existence only by typing it, never renamed and never described. It is now a
record carrying a **code and a bilingual title**, with rounds pointing at it.

`rounds.phase_code` stays, kept in step by trigger, because the app renders it in the
round header and there is no reason to make every reader join a table for two
characters. A writer that knows only the code — the CLI importer, the ministry's JSON
— has the phase found or created for it, so a round whose phase does not exist cannot
occur.

**Full CRUD** across phase, round and book: create, rename, edit and delete, plus
archive for anything live. Days are created, scheduled and deleted inside the book.

### Delete is a data rule, not a UI rule

Deleting a day cascades to `day_completions` — so deleting content somebody has read
would silently rewrite their streak. Published or read content can therefore only be
**archived**, which keeps it in the library and leaves every completion intact.
Enforced by trigger, so no screen, script or stray API call can route around it.

### The bug that only a cross-user test could find

The guards counted completions to decide whether a delete was safe. Trigger functions
run as the invoking user, and `day_completions` is own-row-only under RLS — so when an
**admin** deleted a day, the guard could not see anybody else's completions, counted
zero, and allowed it.

The protection worked only when the person deleting was the person who had read it,
which is the one case that does not matter. The pgTAP test passed throughout, because
it used the admin's own completion for both roles.

Found by running the delete over the API as an admin against a member's history. The
guards are now `SECURITY DEFINER`, the pgTAP fixture uses a second user, and
`pnpm check:content` runs the cross-user case in CI so it cannot regress.

61 pgTAP tests across five files; three end-to-end API checks now in CI.


## Phase 6 — what was built

**Planning and sending are separate, and that is the whole design.**
`plan_notifications(date)` decides what should reach whom on a ministry date and
writes it down; delivery reads those rows and talks to FCM. Everything is derived
from state rather than from events, so a month can be replayed in a test rather than
waited for — which is exactly what the exit criterion asks for.

**Eleven rungs**, each admin-configurable, each member-disableable, with copy stored
as content in both languages and variants that rotate so the same words do not
arrive every night. `comeback_d14` ships **off**: two weeks of silence is a decision,
and a third nudge after it risks being the one that gets the app deleted.

**The cap is what makes the ladder safe to leave on.** At most two non-broadcast
notifications per person per day, chosen by priority — actionable and time-limited
beats celebratory, which beats informational, which beats re-engagement. Anything
over the cap is marked `suppressed_by` rather than deleted, so it is possible to see
what the ladder wanted to send and what stopped it.

**Broadcasts sit outside the cap** deliberately: the cap exists to keep the automated
ladder quiet, not to silence a person addressing their own ministry. They target
everyone, the recently active, those slipping below a streak, or the committed — and
the dashboard shows the reach before the send, which cannot be recalled.

**The feedback loop the spec asks for**: the dashboard shows how many members have
muted each kind, turning red past 30%. An admin who cannot see that half the ministry
muted the evening nudge will keep sending it.

**Scheduled with pg_cron** — hourly, plus once just after midnight EAT. Planning is
idempotent, so running it repeatedly is not just safe but useful: someone who reads
at 11:00 stops being a candidate for the evening rungs.

### Verified

- pgTAP now 80 across six files, including a **simulated month**: every day of a
  30-day round planned in sequence, with no day exceeding two notifications for
  anyone. Individual rungs are provoked by arranging the state that triggers them.
- `pnpm check:notifications` drives the same paths over HTTP: the cap holds,
  replanning writes nothing new, a member reads only their own, a muted kind stops
  being planned, a broadcast reaches its stated audience and refuses to send twice.
- Mobile settings screen for per-kind preferences; device registration on sign-in.

### Not verified — and one hard dependency

**No push has been delivered, because there is no Firebase project.** `due_notifications`
and `mark_notification_sent` are the boundary a sender talks to, and device
registration writes tokens when it can, but obtaining a real FCM token needs a
Firebase project, a `google-services.json` in the build, and a development build
rather than Expo Go. Everything up to "here is the exact message for this person"
is built and tested; the last hop is not.

That is a credential and a build, not a design question — but it is a genuine gate
on Phase 6 being *finished* rather than merely correct.

## Phase 7 — what was built

**The Bible text is a bundled read-only SQLite database, and translations are rows.**
Nothing in the reader names a translation: it asks for the one matching the member's
reader language and renders whatever comes back. That is the whole engineering
mitigation for licensing gate 1 — a public-domain text drops in with no code change.

**The gate is mechanical, not remembered.** `build-bible.mjs` builds only
translations marked `distributable`. The © Biblica texts require `--include-licensed`,
which prints a warning naming what it did, and the built database is gitignored. With
nothing distributable available today a default build produces an *empty* database —
still a file, because the app bundles it as an asset and a missing asset is a build
error rather than a graceful fallback.

**No text for your language is not an error.** `translationFor` deliberately does not
fall back to another language: handing an Amharic reader an English text under
Amharic book names reads as a bug, and the spec says the Amharic side deep-links out
instead. The reader shows an offer — "Read this passage… open in YouVersion" — which
is the path that ships until permission lands.

**Reader language is independent of UI language**, per the spec. Book names come from
the existing 66-book lexicon, so they are localised without the scripture database
carrying names at all.

**Search folds Ethiopic**, using the same `foldForSearch` that folded the index at
build time — the only reason ሠ finds ሰ. It is a scan rather than an index, because a
leading wildcard cannot use one; over ~31,000 short rows for one translation that is
fine for a search someone submits.

**Highlights and bookmarks are keyed by canonical reference, not by translation**, so
switching reader language keeps them. Both are device-local: the spec does not sync
them, and a highlight is closer to a dog-ear than to a reflection.

### Things that bit, and are now defended

- **A truncated copy is permanent.** The first side-load left a 0-byte `bible.db`;
  `exists` was true, so every launch afterwards skipped the copy and opened an empty
  database. The check is now a byte count, and a too-small file is deleted and
  re-copied.
- **Opening the chapter is not opening the verse.** Psalm 18:20 is well below the
  fold. The reader scrolls to the referenced verse — twice, because the first attempt
  cannot reach a row that is not rendered yet and the failure handler can only scroll
  to a guess.
- **A programmatic jump is not a swipe.** It fired `onScroll` and hid the nav exactly
  when someone arriving from a cross-reference most needed to see where they landed.

### Known, and deferred

- **`check:bible-refs` finds one unresolvable reference** in the seeded content: day
  18 cross-references ዘዳ 18:23, and Deuteronomy 18 ends at verse 22. Recorded in
  `CONTENT_ISSUES.md` for the ministry rather than guessed at.
- **Both translations together are 17.2 MB**, and expo-asset's 60-second download
  timeout makes that unusable *in development on an emulator*, where the asset comes
  from Metro rather than out of the APK. `--only=<code>` builds one translation for
  testing; 12.6 MB downloads fine. A release build reads the asset locally and is
  unaffected.
