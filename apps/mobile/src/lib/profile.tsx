import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Language, PartOfDay } from '@abide/domain'
import { supabase } from './supabase'
import { useSession } from './session'
import { translate, type StringKey } from './i18n'
import { log } from './log'

export interface ProfileRow {
  id: string
  display_name: string
  ui_language: Language
  reader_language: Language
  part_of_day: PartOfDay
  joined_on: string
  role: 'user' | 'admin'
}

export interface StreakRow {
  current: number
  best: number
  last_counted_date: string | null
  repair_credits: number
}

interface ProfileValue {
  profile: ProfileRow | null
  streak: StreakRow | null
  loading: boolean
  /** Today in ministry time, from the server — never the device's clock. */
  today: string | null
  refresh: () => Promise<void>
  setStreak: (next: StreakRow) => void
  t: (key: StringKey, vars?: Record<string, string | number>) => string
  language: Language
}

const ProfileContext = createContext<ProfileValue | null>(null)

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [streak, setStreak] = useState<StreakRow | null>(null)
  const [today, setToday] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!session) {
      setProfile(null)
      setStreak(null)
      setLoading(false)
      return
    }
    setLoading(true)

    const [profileResult, streakResult, todayResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, ui_language, reader_language, part_of_day, joined_on, role')
        .eq('id', session.user.id)
        .maybeSingle(),
      supabase
        .from('streak_state')
        .select('current, best, last_counted_date, repair_credits')
        .eq('user_id', session.user.id)
        .maybeSingle(),
      // The day boundary is EAT and the server owns it. Asking the device would
      // let a wrong clock decide what "today" means.
      supabase.rpc('ministry_today'),
    ])

    log.result('profile', 'load profile', profileResult)
    log.result('profile', 'load streak', streakResult)
    log.result('profile', 'ministry_today', todayResult)

    setProfile((profileResult.data as ProfileRow | null) ?? null)
    setStreak((streakResult.data as StreakRow | null) ?? null)
    setToday((todayResult.data as string | null) ?? null)
    setLoading(false)
  }, [session])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const language: Language = profile?.ui_language ?? 'am'

  const value = useMemo<ProfileValue>(
    () => ({
      profile,
      streak,
      loading,
      today,
      refresh,
      setStreak,
      language,
      t: (key, vars) => translate(key, language, vars),
    }),
    [profile, streak, loading, today, refresh, language],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile must be used inside ProfileProvider')
  return value
}
