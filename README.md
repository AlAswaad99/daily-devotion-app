# Abide

A bilingual daily-devotion app for a church youth ministry: everyone walks the same
study on the same day, in Amharic or English, offline, with streaks that reward
showing up.

The build contract is [docs/SPEC.txt](docs/SPEC.txt). Deferred decisions live in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md); scripture-reference problems awaiting the
ministry are in [CONTENT_ISSUES.md](CONTENT_ISSUES.md).

**Status: Phase 0 (Foundations) complete.** See [docs/PHASES.md](docs/PHASES.md).

## Layout

```
apps/mobile      Expo (React Native) app — expo-router
apps/admin       Next.js admin dashboard
packages/domain  Shared TypeScript domain types and pure rules
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

```bash
pnpm db:start
```

`db:start` prints an anon key. It is the standard local key and is already written
into `apps/mobile/.env` and `apps/admin/.env.local`; if yours differs, update both.

```bash
pnpm --filter @abide/mobile start
```

```bash
pnpm --filter @abide/admin dev
```

The seed creates one church, one youth ministry, and the join code **`ABIDE-DEV`**.
Create an account in the app with that code to get a profile and land on a
scheduled day.

## Checks

```bash
pnpm typecheck && pnpm test && pnpm db:test
```

`db:test` runs the pgTAP suite, including the policy test that an admin cannot read
another member's reflection. CI runs all of these on every pull request.

## Two things that gate release, not development

1. **Scripture licensing.** The bundled NIV and Amharic NASV XML are © Biblica, Inc.
   Development proceeds against them; nothing ships to a store or to users outside
   the dev team until written permission exists. The reader is built
   translation-agnostic so a public-domain text can be substituted.
2. **Font licensing.** The prototype's Nokia and Niyala faces are not licensable for
   app embedding. Noto Sans/Serif Ethiopic (OFL) replace them in Phase 9.

The `.zbl` files in `bibles/` are encrypted commercial packages and are **not** used
as a text source.
