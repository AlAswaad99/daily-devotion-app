/**
 * Is the Firebase setup right?
 *
 * Separates a credential problem from a device problem, which is worth doing
 * because they present identically: nothing arrives on the phone. This proves the
 * service account can sign a JWT, that Google will exchange it for an access token
 * with the messaging scope, and that FCM accepts that token — by deliberately
 * sending to an invalid device token and expecting a 400 rather than a 401 or 403.
 *
 * A 400 here means everything except the destination is correct.
 *
 *   node scripts/check-fcm-credentials.mjs
 */
import { readFile } from 'node:fs/promises'
import { createSign } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT ??
  path.join(repoRoot, 'secrets', 'firebase-service-account.json')

const sa = JSON.parse(
  await readFile(SERVICE_ACCOUNT_PATH, 'utf8'),
)

const now = Math.floor(Date.now() / 1000)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
  iss: sa.client_email,
  scope: 'https://www.googleapis.com/auth/firebase.messaging',
  aud: 'https://oauth2.googleapis.com/token',
  iat: now,
  exp: now + 3600,
})}`

const signer = createSign('RSA-SHA256')
signer.update(unsigned)
const signature = signer.sign(sa.private_key, 'base64url')

const r = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: `${unsigned}.${signature}`,
  }),
})
const body = await r.json()

if (!body.access_token) {
  console.log('FAIL  Google rejected the service account:', JSON.stringify(body))
  process.exit(1)
}
console.log('PASS  signed a JWT and obtained a Google access token')
console.log(`      scope accepted, expires in ${body.expires_in}s`)

// Now prove FCM itself accepts us, using a deliberately invalid token: a 400
// "not a valid FCM registration token" means auth passed and only the target was
// wrong, which is exactly what we want to know before a real device exists.
const probe = await fetch(
  `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
  {
    method: 'POST',
    headers: { authorization: `Bearer ${body.access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: { token: 'not-a-real-token', notification: { title: 'x', body: 'y' } } }),
  },
)
const probeBody = await probe.text()

if (probe.status === 401 || probe.status === 403) {
  console.log(`FAIL  FCM rejected our credentials (${probe.status}): ${probeBody.slice(0, 200)}`)
  process.exit(1)
}
console.log(`PASS  FCM accepted the credentials (${probe.status} on a deliberately invalid device token)`)
console.log(`      ${probeBody.slice(0, 160).replace(/\s+/g, ' ')}`)
