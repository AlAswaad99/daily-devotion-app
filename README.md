# Abide

A bilingual daily-devotion app for a church youth ministry: everyone walks the same
study on the same day, in Amharic or English, offline, with streaks that reward
showing up.

The build contract is [docs/SPEC.txt](docs/SPEC.txt). Deferred decisions live in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md); scripture-reference problems awaiting the
ministry are in [CONTENT_ISSUES.md](CONTENT_ISSUES.md).

**Status: Phase 6 (Notifications) complete.** See [docs/PHASES.md](docs/PHASES.md).

## Layout

```
apps/mobile      Expo (React Native) app — expo-router
apps/admin       Next.js admin dashboard
packages/domain  Domain types, the streak engine, completion rule, EC calendar
packages/content Scripture reference parser, validator, and the JSON importer
supabase/        Migrations, RLS policies, pgTAP tests, dev seed
bibles/          Source scripture XML — see the licensing gate below
tools/           validate_refs.py, the scripture-reference validator
project/         The original Claude Design HTML prototypes
```

## Running it locally

Requires Node 20+, pnpm, and Docker Desktop running.

```bash
pnpm install
```

Then start everything — Supabase, the Edge Functions runtime, the admin dashboard and
Expo — in one terminal:

```bash
pnpm dev
```

The functions runtime is part of that on purpose: without it, notifications queue and
are never delivered, which from the dashboard is indistinguishable from a broken Send
button. Ctrl+C stops the servers and leaves the Supabase containers up, since they
hold your data.

To run less of it: `pnpm dev --no-mobile`, or `pnpm dev --only=admin` (one of `db`,
`functions`, `admin`, `mobile`).

| | |
|---|---|
| admin | http://localhost:3000 |
| Studio | http://127.0.0.1:54323 |
| Inbucket | http://127.0.0.1:54324 |

### Or one piece at a time

```bash
pnpm db:start
```

`db:start` prints an anon key. It is the standard local key and is already written
into `apps/mobile/.env` and `apps/admin/.env.local`; if yours differs, update both.

```bash
pnpm --filter @abide/mobile start
```

The app targets **Expo SDK 54** to match the Expo Go build on the Play Store. Expo
Go runs only its own SDK, so check the installed client's version before bumping
this — npm's `latest` runs ahead of the store.

Scan the QR from a phone on the same Wi-Fi. `.env` points Supabase at
`127.0.0.1`, which on a phone means the phone; the client rewrites that host to
whatever address Expo is serving the bundle from, so no hand-editing is needed.

```bash
pnpm --filter @abide/admin dev
```

**On Windows**, a reboot can leave Windows holding the port range Supabase needs, and
the error says nothing about why. `pnpm dev` detects it and prints the fix; the
one-off cure is `net stop winnat && net start winnat` in an admin terminal.

The seed establishes tenancy and a dev account — one church, one youth ministry,
the join code **`ABIDE-DEV`**, and a login that survives a database reset:

| | |
|---|---|
| email | `dev@abide.local` |
| password | `abide12345` |

Load the ministry's devotions with the importer:

```bash
pnpm --filter @abide/content content:import
```

By default the round starts 30 days ago, so today falls inside it; pass
`-- --start=YYYY-MM-DD` to place it elsewhere, or `-- --dry-run` to see the
calendar without writing. Re-running updates in place rather than duplicating.

Sign in as the dev account, or create your own with the join code.

Applying a migration means resetting the local database, which wipes every
account. This does the reset, re-imports the content, and gives the dev account
three weeks of realistic history — a streak, some reflections, a favourite, and
yesterday left unread so the repair offer is eligible:

```bash
pnpm dev:reset
```

`pnpm dev:demo` re-applies just the demo progress.

## Checks

```bash
pnpm typecheck && pnpm test && pnpm db:test
```

`db:test` runs the pgTAP suite, including the policy test that an admin cannot read
another member's reflection. CI runs all of these on every pull request.

The offline sync contract is checked end to end over HTTP, the way the app drives
it — a week queued offline, a replayed flush, and a wound-back clock:

```bash
pnpm check:offline
```

And the admin authoring path — author, review, publish, and the privacy boundary:

```bash
pnpm check:admin
```

To re-check the ministry's scripture references and regenerate
[docs/content-report.md](docs/content-report.md):

```bash
pnpm --filter @abide/content validate
```

## Notifications

The ladder plans and caps itself with no credential required. Delivery to a phone
needs a Firebase project and a development build — see
[docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md).

```bash
node scripts/plan-notifications.mjs
```

```bash
node scripts/send-notifications.mjs --dry-run
```

Delivery itself is scheduled: pg_cron invokes the `send-notifications` Edge Function
every five minutes. On a dev machine that function has to be running, or queued
notifications sit in the queue and the dashboard's Send button looks broken:

```bash
supabase functions serve --env-file supabase/functions/.env
```

## Two things that gate release, not development

1. **Scripture licensing.** The bundled NIV and Amharic NASV XML are © Biblica, Inc.
   Development proceeds against them; nothing ships to a store or to users outside
   the dev team until written permission exists. The reader is built
   translation-agnostic so a public-domain text can be substituted.
2. **Font licensing.** The prototype's Nokia and Niyala faces are not licensable for
   app embedding. Noto Sans/Serif Ethiopic (OFL) replace them in Phase 9.

The `.zbl` files in `bibles/` are encrypted commercial packages and are **not** used
as a text source.
