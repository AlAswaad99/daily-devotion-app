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

/*
 * FCM's permanent failures, which no amount of retrying will change.
 *
 * UNREGISTERED and SENDER_ID_MISMATCH mean the install is gone or belongs to another
 * project; INVALID_ARGUMENT means the token is malformed. Everything else — chiefly
 * UNAVAILABLE, INTERNAL and QUOTA_EXCEEDED — is worth another attempt.
 */
const PERMANENT = new Set([
  'UNREGISTERED',
  'INVALID_ARGUMENT',
  'SENDER_ID_MISMATCH',
  'THIRD_PARTY_AUTH_ERROR',
])

/** The token is not just rejected, it is gone, and should be forgotten. */
const DEAD = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH'])

/**
 * The machine-readable code and the human sentence, out of an FCM error body.
 *
 * Both matter and for different readers: the code decides whether to retry, the
 * message is what an admin sees in the delivery report. Storing the raw JSON instead
 * put a wall of braces in the dashboard.
 */
function describeError(body) {
  try {
    const parsed = JSON.parse(body)
    const detail = (parsed.error?.details ?? []).find((d) => d.errorCode)
    return {
      code: detail?.errorCode ?? parsed.error?.status ?? null,
      message: parsed.error?.message ?? null,
    }
  } catch {
    return { code: null, message: null }
  }
}

/**
 * Deliver one planned notification to every device its owner has registered.
 *
 * Returns the outcome, whether it is worth retrying, and any tokens that should be
 * forgotten.
 *
 * `'skipped'` when there is no device to send to — a member who has never opened the
 * app on a phone is not a failure, and counting them as one made a healthy run look
 * broken. `'sent'` if any device accepted it: someone with a working phone and a dead
 * one got the message, and the dead token is pruned rather than held against them.
 *
 * "Accepted" is the strongest word available. FCM's send API reports that it took the
 * message, not that a phone displayed it.
 */
export async function deliver(n, token, projectId) {
  const { title, body } = localise(n)

  if (n.fcm_tokens.length === 0) {
    return { outcome: 'skipped', error: 'no registered device', permanent: true, dead: [] }
  }

  let delivered = false
  let lastError = null
  let lastPermanent = true
  const dead = []

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

    if (response.ok) {
      delivered = true
      continue
    }

    /*
     * Parse before truncating. Slicing the body first cut the JSON mid-object, so
     * `JSON.parse` failed and every rejection came back with no code — which meant a
     * permanently dead token was treated as a transient blip and retried five times
     * instead of being forgotten.
     */
    const full = await response.text()
    const { code, message } = describeError(full)
    if (code && DEAD.has(code)) dead.push(target)

    lastError = [response.status, code ?? 'unclassified', message ?? full.slice(0, 150)]
      .filter(Boolean)
      .join(' · ')
    // Retry only if every failure so far could plausibly succeed later.
    lastPermanent = lastPermanent && !!code && PERMANENT.has(code)
  }

  if (delivered) return { outcome: 'sent', error: null, permanent: false, dead }
  return { outcome: 'failed', error: lastError, permanent: lastPermanent, dead }
}
