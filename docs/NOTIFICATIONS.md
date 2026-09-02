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

## Seeing a rung's wording on a real phone

Each rung on the Notifications page has a **Use** button. It loads that rung's
copy — both languages — into the broadcast composer, where it can be edited or
sent as is.

This sends as a *broadcast*, not as the rung itself: it does not wait for a
streak to be at risk or for three quiet days to pass. The point is to see the
words land on a device, which is otherwise hard to arrange for something like
`comeback_d14`.

Copy containing `{streak}` is flagged before sending. That token is filled in per
member when the real rung fires; a broadcast has no member to fill it from, so it
would arrive literally.

**Edit wording** is the other button — it opens the stored title and body for
that kind, which is what every future send of that rung will use.

## Checking the credentials on their own

Before blaming the phone, confirm the Firebase side works:

```bash
node scripts/check-fcm-credentials.mjs
```

It signs a JWT with the service account, exchanges it for a Google access token,
and sends to a deliberately invalid device token. A **400** is the pass: it means
authentication succeeded and only the destination was wrong. A 401 or 403 means
the service account is the problem, not the device.

## If a token never appears

- **Expo Go**: expected. It cannot produce an FCM token; use a development build.
- **Emulator without Play Services**: FCM requires them. Use a Google Play system
  image, or a physical device.
- **Permission denied**: Android 13+ asks on first launch. Once denied, the app
  cannot ask again — clear app data or grant it in system settings.
- **Package mismatch**: `org.abide.app` in Firebase must equal `android.package`
  in `apps/mobile/app.json`.


## Delivery is scheduled, not manual

Queueing and delivering are two different steps, and only the first happens in the
database. `plan_notifications` and an admin's Send button both write rows to
`notifications`; nothing in Postgres can talk to FCM, because the Firebase credential
cannot live there.

The hop that reaches a phone is the `send-notifications` Edge Function, invoked every
five minutes by pg_cron through pg_net:

```
pg_cron (*/5) → dispatch_notifications() → pg_net → Edge Function → FCM
```

It is safe to invoke at any time. `due_notifications` returns only unsent rows and
`mark_notification_sent` retires each one as it goes, so overlapping runs cannot send
anything twice.

### The credential

The function reads the service account from a secret, not from `secrets/`:

```bash
supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat secrets/firebase-service-account.json)"
```

Locally, `supabase/functions/.env` holds the same value and is gitignored. Serve the
functions runtime alongside the stack, or nothing will be delivered on a dev machine:

```bash
supabase functions serve --env-file supabase/functions/.env
```

### On a deployed database

The cron job posts to the local gateway by default. Point it at the real project by
storing two vault secrets — the migration reads them and falls back to the local
values only when they are absent:

```sql
select vault.create_secret('https://<project>.functions.supabase.co', 'abide_functions_url');
select vault.create_secret('<service-role-key>', 'abide_service_role_key');
```

### Reading a run

`sent`, `skipped` and `failed` mean three different things. **Skipped** is a member
with no registered device — not an error, just someone who has never opened the app
on a phone. Only **failed** is a real refusal from FCM, such as a token that has been
revoked. A healthy ministry run is mostly skips until devices accumulate.


## Delivery status, retries, and resending

### What "sent" can honestly mean

FCM's send API reports that it **accepted** a message. It does not report that a
phone displayed one. A message can be accepted and never seen — the phone is off for
a week, the app was force-stopped, the OS deferred it. Real per-message delivery data
exists only in Firebase's BigQuery export, which is a separate pipeline.

So the dashboard column says *Sent*, the page says *"Sent means Firebase accepted
it"*, and nothing anywhere says *delivered* or *read*.

### The four outcomes

| Status | Meaning | Retried? |
|---|---|---|
| `pending` | Not attempted yet, or waiting out a backoff | Yes, when due |
| `sent` | FCM accepted it for at least one of their devices | No |
| `failed` | Rejected, and either permanent or out of attempts | Only on an admin resend |
| `no_device` | The member has no phone registered | No — closed |

### Retry, and the loop that used to be

`mark_notification_sent` stamped `sent_at` only on success, and `due_notifications`
returned everything where `sent_at is null`. Nothing ever left the queue: **every
failure was retried on every five-minute tick, for ever.** Thirty-three notifications
addressed to members with no phone had accumulated, and each run re-attempted all of
them.

Now a transient failure backs off — 5, 10, 20, 40 minutes — and is given up on after
`notification_max_attempts()` tries. A permanent failure is not retried even once.

The distinction comes from FCM's own error code:

- **Permanent**: `UNREGISTERED`, `INVALID_ARGUMENT`, `SENDER_ID_MISMATCH`,
  `THIRD_PARTY_AUTH_ERROR`
- **Transient**: everything else, chiefly `UNAVAILABLE`, `INTERNAL`, `QUOTA_EXCEEDED`

A token rejected as dead is deleted by `prune_device_token`. Keeping it would spend an
attempt on every future send and inflate every delivery report with installs that no
longer exist; if the member reinstalls, the app registers a new token on first launch.

**Parse the error body before truncating it.** Slicing to 300 characters first cut the
JSON mid-object, `JSON.parse` failed, and every rejection came back unclassified — so
a permanently dead token was treated as a transient blip and retried five times
instead of being forgotten. It looked like it worked.

### Resending

`resend_broadcast_failures(broadcast)` requeues that broadcast's failures, and members
recorded as `no_device` **only if they have since registered a phone** — exactly when
retrying them becomes worthwhile.

The original wording is reused; variables are not re-rendered. A resend is another
attempt at one message, and re-rendering would mean the copy someone receives on
Thursday differs from what everyone else got on Tuesday.

### Retention

Per-notification rows are kept 90 days, pruned nightly by `prune_notifications()`.
One row per member per notification adds up quickly once a ministry is large.
