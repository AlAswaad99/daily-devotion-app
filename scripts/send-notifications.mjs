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
import { createSign } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/**
 * Google wants an OAuth token, and getting one means signing a JWT with the service
 * account key. Done by hand rather than pulling in googleapis for one call.
 */
async function accessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64(header)}.${b64(claims)}`

  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const signature = signer.sign(serviceAccount.private_key, 'base64url')

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  })

  const body = await response.json()
  if (!body.access_token) {
    throw new Error(`could not obtain a Google access token: ${JSON.stringify(body)}`)
  }
  return body.access_token
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

// Copy is bilingual and the member's own language is the one that reaches them.
const localise = (n) => ({
  title: n.ui_language === 'am' ? n.title_am : n.title_en,
  body: n.ui_language === 'am' ? n.body_am : n.body_en,
})

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
const endpoint = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`

let sent = 0
let failed = 0

for (const n of due) {
  const { title, body } = localise(n)

  if (n.fcm_tokens.length === 0) {
    // Nothing to send to. Recorded rather than retried forever: a member with no
    // registered device is not an error, they simply have no phone attached.
    await rpc('mark_notification_sent', { p_id: n.id, p_error: 'no registered device' })
    failed++
    continue
  }

  let anyDelivered = false
  let lastError = null

  for (const target of n.fcm_tokens) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: target,
          notification: { title, body },
          data: { kind: n.kind, notification_id: n.id },
          android: { priority: 'high' },
        },
      }),
    })

    if (response.ok) {
      anyDelivered = true
    } else {
      lastError = `${response.status} ${await response.text()}`
    }
  }

  if (anyDelivered) {
    await rpc('mark_notification_sent', { p_id: n.id })
    sent++
  } else {
    await rpc('mark_notification_sent', { p_id: n.id, p_error: lastError })
    failed++
  }
}

console.log(`\nsent ${sent}, failed ${failed}`)
