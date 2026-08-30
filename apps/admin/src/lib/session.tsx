'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { createClient } from './supabase-browser'

export interface AdminProfile {
  id: string
  display_name: string
  role: 'user' | 'admin'
  church_id: string
  ministry_id: string
}

interface SessionValue {
  session: Session | null
  profile: AdminProfile | null
  loading: boolean
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

/**
 * The dashboard runs entirely as the signed-in admin, with the anon key.
 *
 * There is no service-role client anywhere in this app, and that is the whole
 * design: RLS is what keeps reflections unreadable, and a service-role key would
 * quietly step over it. A non-admin who signs in here simply sees nothing, because
 * every policy checks the role — the UI does not need to be the gatekeeper.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), [])
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<AdminProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(
    async (current: Session | null) => {
      if (!current) {
        setProfile(null)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, role, church_id, ministry_id')
        .eq('id', current.user.id)
        .maybeSingle()
      setProfile((data as AdminProfile | null) ?? null)
    },
    [supabase],
  )

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession()
      setSession(data.session)
      await loadProfile(data.session)
      setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void loadProfile(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase, loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [supabase])

  const value = useMemo(
    () => ({ session, profile, loading, signOut }),
    [session, profile, loading, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
