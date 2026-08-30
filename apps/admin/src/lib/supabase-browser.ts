import { createBrowserClient } from '@supabase/ssr'
import { log } from './log'

/**
 * Every request the dashboard makes, logged.
 *
 * There are no API routes to instrument — the browser talks to PostgREST directly
 * under the admin's own session — so the boundary worth watching is this fetch.
 * Wrapping it here means one place covers every table read, every RPC and every
 * auth call, including ones added later.
 *
 * The reason it matters: RLS failures are quiet. A policy that refuses a write
 * returns an error object rather than throwing, and a screen that ignores it simply
 * does not change. Both bugs found by hand in this dashboard — the Users page role
 * dropdown and the device registration — looked exactly like "nothing happened".
 */
const isDev = process.env.NODE_ENV !== 'production'

/** `/rest/v1/rpc/send_broadcast?…` → `rpc send_broadcast`, `/rest/v1/books?…` → `books`. */
function describe(url: string, method: string): string {
  try {
    const { pathname, searchParams } = new URL(url)
    const rest = pathname.replace(/^\/rest\/v1\//, '')
    const auth = pathname.startsWith('/auth/')

    if (auth) return `auth ${pathname.replace('/auth/v1/', '')}`

    const name = rest.startsWith('rpc/') ? `rpc ${rest.slice(4)}` : rest
    const select = searchParams.get('select')
    const filters = [...searchParams.keys()].filter(
      (k) => !['select', 'order', 'limit', 'offset'].includes(k),
    )

    return (
      `${method} ${name}` +
      (filters.length ? ` where ${filters.join(',')}` : '') +
      (select && select !== '*' ? '' : '')
    )
  } catch {
    return `${method} ${url}`
  }
}

const tracedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')

  if (!isDev) return fetch(input, init)

  const startedAt = performance.now()
  const label = describe(url, method)

  try {
    const response = await fetch(input, init)
    const ms = Math.round(performance.now() - startedAt)

    if (!response.ok) {
      // Read the body from a clone so the caller still gets an unconsumed stream.
      let detail = ''
      try {
        detail = (await response.clone().text()).slice(0, 300)
      } catch {
        detail = '(body unavailable)'
      }
      const rls = detail.includes('42501') || detail.includes('row-level security')
      log.error(
        'db',
        `${label} → ${response.status} in ${ms}ms` +
          (rls ? ' — refused by a row-level security policy' : ''),
        detail,
      )
    } else {
      const range = response.headers.get('content-range')
      log.info('db', `${label} → ${response.status} in ${ms}ms${range ? ` [${range}]` : ''}`)
    }

    return response
  } catch (error) {
    log.error('db', `${label} → network error in ${Math.round(performance.now() - startedAt)}ms`, {
      message: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * The dashboard uses the anon key under the signed-in admin's own session.
 * There is no service-role client in this codebase on purpose: RLS is where the
 * privacy guarantees live, and a service-role key would bypass all of them.
 */
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: tracedFetch } },
  )
