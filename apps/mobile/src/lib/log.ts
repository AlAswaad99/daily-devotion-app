/**
 * Development logging.
 *
 * Everything here is compiled out of a production build by the `__DEV__` guard, so
 * it is safe to be noisy. It exists because the last bug — sign-in appearing to do
 * nothing — was invisible from the outside: the request succeeded, the screen just
 * did not move. Logging the boundary between the app and Supabase makes that class
 * of problem obvious.
 *
 * Never log a password, a token, or anything a user has written.
 */
const REDACTED = '••••'

/** Keys whose values must never reach the console. */
const SECRET = /pass|token|secret|key|body|reflection/i

const scrub = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(scrub)
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET.test(k) ? REDACTED : scrub(v),
    ]),
  )
}

const stamp = () => new Date().toISOString().slice(11, 23)

export const log = {
  info(scope: string, message: string, detail?: unknown) {
    if (!__DEV__) return
    if (detail === undefined) console.log(`${stamp()} [${scope}] ${message}`)
    else console.log(`${stamp()} [${scope}] ${message}`, scrub(detail))
  },

  /**
   * Supabase returns errors in the result rather than throwing, which is easy to
   * drop on the floor. Passing every result through here means a failure is always
   * visible, even where the screen chooses not to surface it.
   */
  result(scope: string, operation: string, result: { error?: unknown; data?: unknown }) {
    if (!__DEV__) return
    if (result.error) {
      console.warn(`${stamp()} [${scope}] ${operation} FAILED`, scrub(result.error))
    } else {
      console.log(`${stamp()} [${scope}] ${operation} ok`, scrub(result.data))
    }
  },

  error(scope: string, message: string, detail?: unknown) {
    if (!__DEV__) return
    console.error(`${stamp()} [${scope}] ${message}`, scrub(detail))
  },
}
