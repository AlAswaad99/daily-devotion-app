# Broadcasts: scheduling, targeting, and personalised copy

The ladder in [NOTIFICATIONS.md](NOTIFICATIONS.md) decides what the *app* says on its
own. This is the other half: what a leader says deliberately, to whom, and when.

## What already exists

Worth stating plainly, because it is more than it looks:

| Capability | State |
|---|---|
| `broadcasts.scheduled_at` | Column exists; `send_broadcast` writes `send_at = coalesce(scheduled_at, now())` and `due_notifications` honours it |
| Segment targeting | `broadcast_audience(jsonb)` supports `active_within_days`, `book_id`, `streak_at_least`, `streak_below` |
| Mute | `notification_enabled` is respected — a member who muted broadcasts is never in the audience |
| Interpolation | `{streak}` only, and only in `plan_notifications` — broadcasts get none |

So the gap is not the database. It is that none of it is reachable, the status is
dishonest, and personalisation stops at one variable in the wrong place.

## The decision that shapes everything: fan out at send time

Today `send_broadcast` writes one `notifications` row per member *immediately*, even
for a future `scheduled_at`. That is wrong once anything is dynamic:

- Target "streak ≥ 7", schedule for Friday, and you freeze Monday's audience. Someone
  who reaches 7 on Wednesday never hears from you; someone who breaks their streak
  still gets congratulated.
- `{streak}` interpolated on Monday is a lie by Friday.
- Editing the wording means rewriting N rows; cancelling means deleting them.

A broadcast therefore stays **one row** until it comes due. A dispatcher resolves the
audience and renders the copy at the moment of sending.

```
admin writes → broadcasts (status=scheduled)
                     ↓  dispatch_broadcasts(), every 5 min
               audience resolved now, copy rendered per member
                     ↓
               notifications rows → Edge Function → FCM
```

"Send now" is the same path with `scheduled_at = now()`, dispatched immediately by
the admin's own call rather than waiting for the next cron tick, so it feels instant.

### Status must stop lying

`send_broadcast` currently stamps `status = 'sent'` at fan-out. Under this design the
statuses mean what they say: `draft` → `scheduled` → `sending` → `sent`, with
`cancelled` available at any point before `sending`. A scheduled broadcast is
cancellable and editable precisely because nothing has been fanned out yet.

## Personalisation

### Variables

Rendered per recipient, at send time, in the member's own language.

| Variable | Value | Fallback when absent |
|---|---|---|
| `{name}` | `profiles.display_name` | `friend` / `ወዳጄ` |
| `{streak}` | current streak | sentence dropped (see below) |
| `{book}` | current book title | sentence dropped |
| `{day}` | day number within the round | sentence dropped |
| `{last_read}` | days since the last completion | sentence dropped |

### Zero is not a value

"You're on a **0** day streak, keep going!" is worse than silence, and a member who
has never read has no `{last_read}` at all. So a variable that cannot resolve does not
render as empty — **the sentence containing it is dropped**, and the rest of the
message is delivered.

This means sentence segmentation has to handle both `.` and the Ethiopic full stop
`።`. A message whose *every* sentence is dropped is not sent to that member, and the
composer says how many people that affects before you send.

### Templates

Admin-authored, ministry-scoped, reusable, and separate from the ladder's built-in
copy — that copy is the app's own voice and stays where it is. A template is a saved
title/body pair in both languages that may contain variables.

### One-to-one

A message to a single member. Same rendering, audience of one.

**Unattributed, deliberately.** The app is the one speaking, not a named leader — a
member should never feel that a particular person is watching their streak. That
choice constrains the copy: it has to be written in the app's voice. "It has been
{last_read} days" is the app noticing; "we noticed you have not read" is a person
noticing, and the second one does not belong here even though the data is identical.

No read receipts. The admin sees delivered or failed, never opened — the same line
the reflections policy draws.

## Bilingual, without blocking

All four copy columns are `NOT NULL` today, so a send is blocked on a translation the
admin may not be able to write. Instead: if one language is missing, members in that
language receive what *was* written, and the composer warns clearly that the
translation is absent. Nobody is silently skipped.

## The cap

Broadcasts are exempt from the two-per-day cap, and stay exempt — the cap exists to
keep the *automated* ladder quiet, not to silence a leader. But exemption plus
scheduling plus targeting is how an app earns itself muted.

So the composer warns rather than blocks: before sending it shows how many
notifications the targeted members already have that day, and flags when this would
be a third.

## Before sending, the admin sees

- **A rendered preview for a real member** picked from the audience — their language,
  their variables, their fallbacks.
- **An audience breakdown**: matched, of whom how many have no registered device and
  how many have muted broadcasts. "Queued for 5" should never be a surprise.
- **An unresolved-variable warning**: how many recipients would lose a sentence.

## Time

Scheduling is in **EAT**, the ministry's timezone, labelled as such — not the admin's
device. Delivery granularity is the dispatch interval, so a broadcast scheduled for
20:00 arrives between 20:00 and 20:05, and the UI should not imply otherwise.
