/**
 * Talking to FCM, shared by the scheduled Edge Function and the manual script.
 *
 * Plain `.mjs` using only web-standard `fetch` and `node:` builtins, because it has
 * to run under both Deno (the Edge Function) and Node (`scripts/send-notifications.mjs`).
 * Keeping one copy matters more than it might look: a divergence here means the
 * scheduled sender and the one you debug with behave differently, which is the worst
 * possible place for a difference to hide.
 */
import { createSign } from 'node:crypto'
import { Buffer } from 'node:buffer'

const OAUTH = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

/**
 * Google wants an OAuth token, and getting one means signing a JWT with the service
 * account key. Done by hand rather than pulling in googleapis for one call.
 */
export async function accessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned =
    `${b64({ alg: 'RS256', typ: 'JWT' })}.` +
    b64({
      iss: serviceAccount.client_email,
      scope: SCOPE,
      aud: OAUTH,
      iat: now,
      exp: now + 3600,
    })

  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const signature = signer.sign(serviceAccount.private_key, 'base64url')

  const response = await fetch(OAUTH, {
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

/** Copy is bilingual; the member's own language is the one that reaches them. */
export const localise = (n) => ({
  title: n.ui_language === 'am' ? n.title_am : n.title_en,
  body: n.ui_language === 'am' ? n.body_am : n.body_en,
})

/**
 * Deliver one planned notification to every device its owner has registered.
 *
 * Returns `'sent'` if any device took it, `'skipped'` when there is no device to
 * send to, and `'failed'` only when a real attempt was refused. That distinction is
 * the point: a member who has never opened the app on a phone is not a failure, and
 * counting them as one made a healthy run look broken.
 */
export async function deliver(n, token, projectId) {
  const { title, body } = localise(n)

  if (n.fcm_tokens.length === 0) return { outcome: 'skipped', error: 'no registered device' }

  let delivered = false
  let lastError = null

  for (const target of n.fcm_tokens) {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
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
      },
    )

    if (response.ok) delivered = true
    else lastError = `${response.status} ${(await response.text()).slice(0, 300)}`
  }

  return delivered ? { outcome: 'sent', error: null } : { outcome: 'failed', error: lastError }
}
