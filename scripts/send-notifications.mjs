/**
 * Deliver what the planner decided, through FCM.
 *
 * This is the last hop, and the only part of the notification system that needs a
 * credential. It reads `due_notifications`, sends each one in the member's own
 * language, and records the outcome — including failures, so a dead token shows up
 * as an error rather than as silence.
 *
 * Credentials, neither of which is committed:
 *   secrets/firebase-service-account.json   from Firebase → Project settings →
 *                                           Service accounts → Generate new private key
 *   SUPABASE_SERVICE_ROLE_KEY               from `supabase status`
 *
 *   node scripts/send-notifications.mjs            send what is due
 *   node scripts/send-notifications.mjs --dry-run  show it without sending
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { accessToken, deliver, localise } from '../supabase/functions/_shared/fcm.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const dryRun = process.argv.includes('--dry-run')

const BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT ??
  path.join(repoRoot, 'secrets', 'firebase-service-account.json')

const headers = {
  apikey: SERVICE,
  authorization: `Bearer ${SERVICE}`,
  'content-type': 'application/json',
}

const rpc = async (fn, body = {}) => {
  const response = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const due = await rpc('due_notifications', { p_limit: 500 })

if (!Array.isArray(due)) {
  console.error('Could not read the queue:', due)
  process.exit(1)
}

if (due.length === 0) {
  console.log('Nothing due.')
  process.exit(0)
}

console.log(`${due.length} notification(s) due`)
for (const n of due) {
  const { title, body } = localise(n)
  console.log(`  ${n.kind} → ${n.fcm_tokens.length} device(s): ${title}`)
  if (dryRun) console.log(`      ${body}`)
}

if (dryRun) {
  console.log('\nDry run — nothing sent, nothing marked.')
  process.exit(0)
}

let serviceAccount
try {
  serviceAccount = JSON.parse(await readFile(SERVICE_ACCOUNT_PATH, 'utf8'))
} catch {
  console.error(
    `\nNo Firebase service account at ${path.relative(repoRoot, SERVICE_ACCOUNT_PATH)}.\n` +
      'Firebase console → Project settings → Service accounts → Generate new private key,\n' +
      'then save it there. Nothing in secrets/ is committed.',
  )
  process.exit(1)
}

const token = await accessToken(serviceAccount)

const tally = { sent: 0, skipped: 0, failed: 0 }

let pruned = 0

for (const n of due) {
  const { outcome, error, permanent, dead } = await deliver(n, token, serviceAccount.project_id)

  for (const target of dead) {
    await rpc('prune_device_token', { p_token: target })
    pruned++
  }

  await rpc('mark_notification_result', {
    p_id: n.id,
    p_status: outcome === 'skipped' ? 'no_device' : outcome,
    p_error: error,
    p_permanent: permanent,
  })
  tally[outcome]++
}

console.log(
  `
sent ${tally.sent}, skipped ${tally.skipped} (no registered device), ` +
    `failed ${tally.failed}` + (pruned ? `, ${pruned} dead token(s) forgotten` : ''),
)
if (tally.failed > 0) {
  console.log('Transient failures come back on their own; the rest need a resend.')
}
