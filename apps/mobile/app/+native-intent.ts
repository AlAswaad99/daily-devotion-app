import AsyncStorage from '@react-native-async-storage/async-storage'
import { auditEnabled, auditFromParams, setAudit } from '../src/lib/audit'
import { LANGUAGE_KEY } from '../src/lib/language'

/**
 * Incoming deep links, before the router sees them.
 *
 * Audit mode (see `src/lib/audit.ts`) rides in on `temuagn://audit?…&to=/streak`: the
 * overrides are applied here and the link is rewritten to its `to` path, so the router
 * navigates to the screen under audit exactly as it would for any other link. Doing it
 * from a route of its own — mount, set state, `router.replace` — turned out to work
 * only for the first link after launch; the rewrite has no such problem.
 *
 * Release builds never rewrite anything.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  if (!auditEnabled) return path
  const bare = path.replace(/^[a-z]+:\/\//i, '/').replace(/^\/+/, '/')
  if (!bare.startsWith('/audit')) return path

  const query = bare.split('?')[1] ?? ''
  const params: Record<string, string> = {}
  for (const pair of query.split('&')) {
    if (!pair) continue
    const [k, v = ''] = pair.split('=')
    params[decodeURIComponent(k!)] = decodeURIComponent(v)
  }

  await setAudit(params.clear === '1' ? {} : auditFromParams(params))
  if (params.lang === 'en' || params.lang === 'am') await AsyncStorage.setItem(LANGUAGE_KEY, params.lang)

  const to = params.to && params.to.startsWith('/') ? params.to : '/'
  console.log('[audit] link →', to, params)
  return to
}
