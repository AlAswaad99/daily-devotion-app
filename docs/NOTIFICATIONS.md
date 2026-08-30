# Notifications: setting up delivery

Everything up to *"here is the exact message for this person"* is built and tested
without any credential. The last hop — actually pushing to a phone — needs a
Firebase project, and two files that are never committed.

## What you have to do

Four steps, all in your own Google account.

**1. Create the Firebase project.**
[console.firebase.google.com](https://console.firebase.google.com) → Add project.
Analytics is optional and not used here.

**2. Register the Android app.**
In the project, add an Android app with the package name **`org.abide.app`** —
it must match `apps/mobile/app.json` exactly or tokens will not resolve.
Download `google-services.json` and save it to:

```
apps/mobile/google-services.json
```

**3. Get a service account key** for the sender.
Project settings → Service accounts → **Generate new private key**. Save it to:

```
secrets/firebase-service-account.json
```

Both paths are gitignored. Neither file should be pasted into a chat or a commit.

**4. Build a development build.**
Expo Go cannot obtain an FCM token — it has no Firebase config of its own. You
need a build that includes yours:

```bash
pnpm --filter @abide/mobile exec expo run:android
```

That compiles a debug APK and installs it on a connected device or emulator.
It replaces `expo start` for push testing; everything else still works the same.

## Testing it

With the app installed and signed in, the device registers its token on launch.
Confirm it arrived:

```bash
docker exec supabase_db_abide psql -U postgres -d postgres -c "select platform, left(fcm_token, 24) || '…' as token, last_seen from devices;"
```

Then plan and send:

```bash
node scripts/plan-notifications.mjs
```

```bash
node scripts/send-notifications.mjs --dry-run
```

```bash
node scripts/send-notifications.mjs
```

`--dry-run` prints exactly what would go out, in each member's own language,
without sending or marking anything.

## What runs in production

`plan_notifications` is scheduled by pg_cron — hourly, plus once just after
midnight EAT. It is idempotent, so repeated runs are useful rather than merely
safe: someone who reads at 11:00 drops out of the evening rungs.

Sending is not yet scheduled. `scripts/send-notifications.mjs` is the reference
implementation; moving it to a Supabase Edge Function on a cron trigger is the
natural next step, and the queue contract (`due_notifications`,
`mark_notification_sent`) does not change when it moves.

## If a token never appears

- **Expo Go**: expected. It cannot produce an FCM token; use a development build.
- **Emulator without Play Services**: FCM requires them. Use a Google Play system
  image, or a physical device.
- **Permission denied**: Android 13+ asks on first launch. Once denied, the app
  cannot ask again — clear app data or grant it in system settings.
- **Package mismatch**: `org.abide.app` in Firebase must equal `android.package`
  in `apps/mobile/app.json`.
