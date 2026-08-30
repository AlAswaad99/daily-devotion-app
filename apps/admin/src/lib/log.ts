/**
 * Development logging for the dashboard.
 *
 * There are no API routes to instrument — every call goes straight from the
 * browser to PostgREST under the admin's own session — so the boundary worth
 * logging is that one: which table or function, what came back, and how long it
 * took.
 *
 * This exists because RLS failures are quiet. A policy that refuses a write does
 * not throw; it returns an error object that is easy to drop on the floor, and the
 * screen simply does not change. Logging every result makes that visible instead
 * of mysterious. The Users page shipped with exactly that bug.
 *
 * Compiled out of production by the `NODE_ENV` guard, and nothing a member has
 * written is ever printed.
 */
const isDev = process.env.NODE_ENV !== 'production'

const REDACTED = '••••'
/** Keys whose values must never reach the console. */
const SECRET = /pass|token|secret|key|body|reflection/i

const scrub = (value: unknown, depth = 0): unknown => {
  if (value === null || typeof value !== 'object' || depth > 4) return value
  if (Array.isArray(value)) {
    return value.length > 5
      ? [...value.slice(0, 5).map((v) => scrub(v, depth + 1)), `…${value.length - 5} more`]
      : value.map((v) => scrub(v, depth + 1))
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET.test(k) ? REDACTED : scrub(v, depth + 1),
    ]),
  )
}

const stamp = () => new Date().toISOString().slice(11, 23)

export const log = {
  info(scope: string, message: string, detail?: unknown) {
    if (!isDev) return
    if (detail === undefined) console.log(`${stamp()} [${scope}] ${message}`)
    else console.log(`${stamp()} [${scope}] ${message}`, scrub(detail))
  },

  error(scope: string, message: string, detail?: unknown) {
    if (!isDev) return
    console.error(`${stamp()} [${scope}] ${message}`, scrub(detail))
  },
}
