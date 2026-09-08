# Phone sign-in via Telegram

Replaces email + password with phone number + OTP. Supabase's own SMS providers
don't reach Ethiopian numbers affordably or reliably (see the cost/coverage
research from the design discussion), so the OTP is delivered over Telegram
instead, through a bot.

Three systems do this, not one — Google Apps Script Web Apps have two
limitations that keep pushing pieces out of `Code.gs` and into small Supabase
Edge Functions instead: they can't read request headers or set a response's
HTTP status code (which Supabase's Send SMS Hook contract needs), and every
`/exec` URL always answers with an HTTP 302 to `script.googleusercontent.com`
to actually serve its content — which is invisible to a browser (which
follows it) but fatal to Telegram's webhook delivery (which doesn't; confirmed
via `getWebhookInfo`: `"Wrong response from the webhook: 302 Found"`).

- **The bot's actual logic** — [`telegram-bot/Code.gs`](telegram-bot/Code.gs), deployed as a Google Apps Script Web App. Handles `/start` and the phone-number contact-share that follows it, records `{phone, chat_id}` in Supabase, and mints a fresh one-time join code for whoever just linked — sent back in the same confirmation message, so nobody has to wait on an admin to hand one out (the admin dashboard's own **Send code** still works too, for anyone who needs a second one). Telegram never calls this directly — see the next point.
- **The Telegram-facing relay** — `supabase/functions/telegram-webhook`. This is what's actually registered as the bot's webhook. It forwards each update to the Apps Script URL (following its redirect itself, re-issuing the POST explicitly rather than trusting `fetch()`'s default redirect handling, which commonly downgrades a redirected POST to a GET), then always answers Telegram with a clean 200 — regardless of how the forward went, so a slow or failing Apps Script call can't turn into a retry storm the way the direct approach did.
- **The Supabase-facing half** — `supabase/functions/telegram-send-otp`. This is what Supabase actually calls to deliver an OTP; it looks up the `chat_id` for the phone and sends the code over Telegram.

## Setup, in order

### 1. Push the schema

Already done if you're reading this after `supabase db push` — migration
`20260908000100_phone_auth.sql` adds the `telegram_links` table, the
`is_telegram_linked` / `admin_onboarding_pipeline` functions, and per-person
join codes.

### 2. Deploy the Apps Script bot

1. [script.new](https://script.new) → paste in [`telegram-bot/Code.gs`](telegram-bot/Code.gs).
2. Project Settings (gear icon) → Script Properties → add:
   - `BOT_TOKEN` — from @BotFather
   - `SUPABASE_URL` — `https://<your-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Settings → API
   - `WEBHOOK_SECRET` — any random string you make up (checked against the
     `?secret=` query param — Apps Script can't read headers, so this is the
     relay-to-script leg's auth, separate from Telegram-to-relay below)
   - `MINISTRY_ID` — which ministry a freshly-minted join code belongs to;
     get it by running `select id, name_en from ministries;` in Supabase's
     SQL editor. Without this, activation still links the phone and confirms
     it over Telegram, just without a code attached — nothing breaks, an
     admin just has to use **Send code** for that person instead.
3. Deploy → New deployment → **Web app**. Execute as **Me**, who has access
   **Anyone**. Copy the deployment URL — this is *not* what Telegram will
   call (see above); keep it for step 3.

### 3. Deploy the relay and the OTP-delivery function

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="<from @BotFather>"
supabase secrets set TELEGRAM_WEBHOOK_SECRET="<any random string you make up>"
supabase secrets set TELEGRAM_BOT_GAS_URL="<the Apps Script deployment URL from step 2, with ?secret=<WEBHOOK_SECRET> appended>"
supabase functions deploy telegram-webhook
supabase functions deploy telegram-send-otp
supabase functions deploy telegram-nudge
```

`telegram-nudge` is the admin dashboard's "send a stalled member their code"
action (Onboarding page) — same bot token, different job.

### 4. Register the webhook

Back in the Apps Script editor: open `registerTelegramWebhook`, set
`RELAY_URL` to `telegram-webhook`'s deployed URL
(`https://<ref>.supabase.co/functions/v1/telegram-webhook`) and
`TELEGRAM_WEBHOOK_SECRET` to the same value you set as a Supabase secret
above, save, and run it once (▸ Run, picking `registerTelegramWebhook` from
the dropdown). Check the execution log for `{"ok":true,...}`, then confirm
with:

```
https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo
```

`url` should be the relay's address, and `last_error_message` should be
absent (or old, from before this fix).

### 5. Configure Supabase's hosted dashboard

No CLI/API path for either of these — both are dashboard-only:

1. **Authentication → Providers → Phone** — enable it.
2. **Authentication → Hooks → Send SMS Hook** — type HTTPS, URL is your
   deployed `telegram-send-otp` function's URL
   (`https://<ref>.supabase.co/functions/v1/telegram-send-otp`), click
   **Generate secret**, copy it, then:
   ```bash
   supabase secrets set SEND_SMS_HOOK_SECRET="whsec_..."
   ```

### 6. Point the app at the bot

`apps/mobile/.env` (and `.env.example`):

```
EXPO_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotUsername
```

The `@username` Telegram shows for your bot, without the `@`. This is what
the sign-in screen's "Activate Telegram" step deep-links to
(`https://t.me/<username>?start=verify`).

## Testing the whole path

1. On a phone with Telegram installed, open the app and enter a phone number
   that has never messaged the bot. You should land on the "Activate
   Telegram" screen.
2. Tap **Open Telegram**, then **Share my phone number** when the bot asks.
   The bot should reply confirming the link — with a join code included in
   that same message, if `MINISTRY_ID` is set (see above).
3. Back in the app, tap **I did this — check again**. It should request an
   OTP and move to the code-entry screen, and the code should arrive in the
   Telegram chat within a few seconds.
4. Enter the OTP, then the join code Telegram sent in step 2 (or one handed
   out another way — both work identically). You should land in onboarding
   (new number) or Today (a number that already has a profile). "Unknown
   join code" here means whatever was typed doesn't match any row in
   `join_codes` — check it against what the Onboarding page's Available
   codes table actually shows, character for character.

If `/start` gets no reply at all, check
`https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo` first —
`last_error_message` will say exactly what's failing (a stale `url` pointing
at the wrong place, or a secret mismatch producing a silent 200 with no
message sent).

If the code never arrives, check the Edge Function logs
(`supabase functions logs telegram-send-otp`) — the two likely culprits are a
phone-format mismatch between what the hook receives and what
`telegram_links.phone` stores (flagged in a comment in
`telegram-send-otp/index.ts`), or the Send SMS Hook secret not matching what
was set with `supabase secrets set`.

## What the admin dashboard adds

The **Onboarding** page (new nav item under People) shows everyone between
"opened the bot" and "finished onboarding" — people the Members page can't
show, since they have no profile yet:

- **Generate codes** — batch-creates one-time join codes (each usable by
  exactly one person), replacing the old single ministry-wide code. A code
  Telegram auto-issued on activation lands in the same Available codes list
  as these — there's no separate view for them.
- **Revoke** a code that was handed out but needs replacing.
- **Reset Telegram** for someone who lost access to their linked Telegram
  account, so they can redo activation with a different one.
- **Send code** — for someone who verified their phone but stalled before
  entering a join code, pushes one directly to their linked Telegram chat
  (via the `telegram-nudge` function) rather than making them find it
  another way.
