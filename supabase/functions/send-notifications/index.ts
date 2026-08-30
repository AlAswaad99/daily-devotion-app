/**
 * Delivery, on a schedule.
 *
 * Everything up to this point happens in the database: `plan_notifications` decides
 * the ladder, the cap trims it, and `send_broadcast` queues an admin's message. None
 * of that reaches a phone. This function is the hop that does, and until it existed
 * the dashboard's Send button wrote rows that sat in the queue until someone
 * remembered to run a script by hand — which read, correctly, as "notifications are
 * broken".
 *
 * It is invoked by pg_cron every five minutes (see the schedule migration) and is
 * safe to call at any time: `due_notifications` only returns what is unsent, and
 * `mark_notification_sent` retires each row as it goes, so overlapping runs cannot
 * send the same notification twice.
 *
 * Needs one secret, set with:
 *   supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat secrets/firebase-service-account.json)"
 */
// @ts-nocheck -- Deno runtime; the repo's tsconfig targets the Node/React workspaces.
import { accessToken, deliver } from '../_shared/fcm.mjs'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const RAW_ACCOUNT = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const rpc = async (fn: string, body: Record<string, unknown> = {}) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE!,
      authorization: `Bearer ${SERVICE_ROLE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

Deno.serve(async () => {
  if (!RAW_ACCOUNT) {
    // Loud, and a 500 so a failing schedule is visible in the function logs rather
    // than looking like a run with nothing to do.
    return json({ error: 'FIREBASE_SERVICE_ACCOUNT is not set' }, 500)
  }

  const due = await rpc('due_notifications', { p_limit: 500 })
  if (!Array.isArray(due)) return json({ error: 'could not read the queue', detail: due }, 500)
  if (due.length === 0) return json({ due: 0, sent: 0, skipped: 0, failed: 0 })

  const serviceAccount = JSON.parse(RAW_ACCOUNT)
  const token = await accessToken(serviceAccount)

  const tally = { sent: 0, skipped: 0, failed: 0 }

  for (const n of due) {
    const { outcome, error } = await deliver(n, token, serviceAccount.project_id)
    await rpc('mark_notification_sent', { p_id: n.id, p_error: error })
    tally[outcome as keyof typeof tally]++
  }

  console.log(`due ${due.length} → sent ${tally.sent}, skipped ${tally.skipped}, failed ${tally.failed}`)
  return json({ due: due.length, ...tally })
})
