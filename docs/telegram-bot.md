# Phone sign-in via Telegram

Replaces email + password with phone number + OTP. Supabase's own SMS providers
don't reach Ethiopian numbers affordably or reliably (see the cost/coverage
research from the design discussion), so the OTP is delivered over Telegram
instead, through a bot.

Two systems do this, not one — see the comment at the top of
[`telegram-bot/Code.gs`](telegram-bot/Code.gs) for why: Google Apps Script Web
Apps can't read request headers or set a response's HTTP status code, both of
which Supabase's Send SMS Hook contract needs.

- **The Telegram-facing half** — [`telegram-bot/Code.gs`](telegram-bot/Code.gs), deployed as a Google Apps Script Web App. Handles `/start` and the phone-number contact-share that follows it, and records `{phone, chat_id}` in Supabase.
- **The Supabase-facing half** — `supabase/functions/telegram-send-otp`, a Supabase Edge Function. This is what Supabase actually calls to deliver an OTP; it looks up the `chat_id` for the phone and sends the code over Telegram.

## Setup, in order

### 1. Push the schema

Already done if you're reading this after `supabase db push` — migration
`20260908000100_phone_auth.sql` adds the `telegram_links` table, the
`is_telegram_linked` / `admin_onboarding_pipeline` functions, and per-person
join codes.

### 2. Deploy the Edge Function

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="<from @BotFather>"
supabase functions deploy telegram-send-otp
supabase functions deploy telegram-nudge
```

`telegram-nudge` is the admin dashboard's "send a stalled member their code"
action (Onboarding page) — same bot token, different job.

### 3. Deploy the Apps Script bot

1. [script.new](https://script.new) → paste in [`telegram-bot/Code.gs`](telegram-bot/Code.gs).
2. Project Settings (gear icon) → Script Properties → add:
   - `BOT_TOKEN` — from @BotFather
   - `SUPABASE_URL` — `https://<your-ref>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Settings → API
   - `WEBHOOK_SECRET` — any random string you make up (this stands in for
     header-based verification, which Apps Script can't do — see the file's
     top comment)
3. Deploy → New deployment → **Web app**. Execute as **Me**, who has access
   **Anyone**. Copy the deployment URL.
4. In the script, open `registerTelegramWebhook`, set `WEB_APP_URL` to that
   deployment URL with `?secret=<the same WEBHOOK_SECRET>` appended, save, and
   run it once (▸ Run, picking `registerTelegramWebhook` from the dropdown).
   Check the execution log — it should show `{"ok":true,...}`.

### 4. Configure Supabase's hosted dashboard

No CLI/API path for either of these — both are dashboard-only:

1. **Authentication → Providers → Phone** — enable it.
2. **Authentication → Hooks → Send SMS Hook** — type HTTPS, URL is your
   deployed `telegram-send-otp` function's URL
   (`https://<ref>.supabase.co/functions/v1/telegram-send-otp`), click
   **Generate secret**, copy it, then:
   ```bash
   supabase secrets set SEND_SMS_HOOK_SECRET="whsec_..."
   ```

### 5. Point the app at the bot

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
   The bot should reply confirming the link.
3. Back in the app, tap **I did this — check again**. It should request an
   OTP and move to the code-entry screen, and the code should arrive in the
   Telegram chat within a few seconds.
4. Enter the code. You should land in onboarding (new number) or Today
   (a number that already has a profile).

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
  exactly one person), replacing the old single ministry-wide code.
- **Revoke** a code that was handed out but needs replacing.
- **Reset Telegram** for someone who lost access to their linked Telegram
  account, so they can redo activation with a different one.
- **Send code** — for someone who verified their phone but stalled before
  entering a join code, pushes one directly to their linked Telegram chat
  (via the `telegram-nudge` function) rather than making them find it
  another way.
