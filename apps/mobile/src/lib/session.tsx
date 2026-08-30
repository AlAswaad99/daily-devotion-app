import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { AuthApiError, type Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { log } from './log'

interface SessionValue {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue>({
  session: null,
  loading: true,
  signOut: async () => {},
})

/**
 * A stored session is not proof the account still exists. If it was deleted on the
 * server — by an admin, or through the account-deletion path the stores require —
 * the token stays cryptographically valid until it expires, and every write then
 * fails a foreign key against a user row that is gone.
 *
 * `getUser()` asks the server. A definitive rejection means the session is dead and
 * is cleared; a network failure means nothing at all and must be ignored, because
 * this app is meant to work for a week in airplane mode.
 */
async function sessionIsStillValid(): Promise<boolean> {
  const { error } = await supabase.auth.getUser()
  if (!error) return true

  // AuthApiError is the server saying no. Anything else (AuthRetryableFetchError
  // and friends) is the network, and a plane is not a logout.
  if (error instanceof AuthApiError) {
    log.info('session', 'server rejected the stored session; signing out', {
      status: error.status,
      message: error.message,
    })
    return false
  }

  log.info('session', 'could not reach auth; keeping the stored session', {
    message: error.message,
  })
  return true
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    log.info('session', 'signing out')
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const { data, error } = await supabase.auth.getSession()
      log.info('session', 'restored from storage', {
        user: data.session?.user.email ?? null,
        error: error?.message ?? null,
      })

      if (data.session && !(await sessionIsStillValid())) {
        await supabase.auth.signOut()
        if (!cancelled) {
          setSession(null)
          setLoading(false)
        }
        return
      }

      if (!cancelled) {
        setSession(data.session)
        setLoading(false)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      log.info('session', `auth event: ${event}`, { user: next?.user.email ?? null })
      setSession(next)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({ session, loading, signOut }), [session, loading, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
