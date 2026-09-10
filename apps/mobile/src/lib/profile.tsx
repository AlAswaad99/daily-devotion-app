import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { AppState } from 'react-native'
import type { Language, PartOfDay, StreakSummary } from '@abide/domain'
import { supabase } from './supabase'
import { useSession } from './session'
import { translate, type StringKey } from './i18n'
import { log } from './log'
import { clearLocalData, getMeta, setMeta, META_TODAY } from '../db/database'
import { localStreak, ministryToday } from '../data/repository'
import { pendingCount } from '../sync/outbox'
import { syncNow } from '../sync/sync'
import { registerForPushNotifications } from './notifications'
import { useAudit } from './audit'

export interface ProfileRow {
  id: string
  display_name: string
  ui_language: Language
  reader_language: Language
  /** Start of the devotion window, as a SQL time on the 24-hour clock. */
  reminder_at: string
  reminder_duration_min: number
  part_of_day: PartOfDay
  joined_on: string
  role: 'user' | 'admin'
}

interface ProfileValue {
  profile: ProfileRow | null
  /** Computed locally so it is correct with no network; the server's value wins on sync. */
  streak: StreakSummary | null
  loading: boolean
  /** Today in ministry time, cached from the last sync — never the device clock. */
  today: string | null
  /** Queued writes not yet acknowledged, so the UI can say so honestly. */
  queued: number
  refresh: () => Promise<void>
  sync: (options?: { force?: boolean; full?: boolean }) => Promise<void>
  t: (key: StringKey, vars?: Record<string, string | number>) => string
  language: Language
}

const ProfileContext = createContext<ProfileValue | null>(null)

const PROFILE_CACHE = 'profile'

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { session, loading: sessionLoading } = useSession()
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [streak, setStreak] = useState<StreakSummary | null>(null)
  const [today, setToday] = useState<string | null>(null)
  const [queued, setQueued] = useState(0)
  const [loading, setLoading] = useState(true)
  const audit = useAudit()

  /** Recompute everything the UI shows from local rows only. */
  const refresh = useCallback(async () => {
    if (!session) {
      setProfile(null)
      setStreak(null)
      setLoading(false)
      return
    }

    // The profile is small and changes rarely, so it is cached locally too —
    // otherwise a cold start with no network would bounce the user to onboarding.
    const cached = await getMeta(PROFILE_CACHE)
    let current: ProfileRow | null = cached ? (JSON.parse(cached) as ProfileRow) : null
    if (current) setProfile(current)

    const fetchProfile = () =>
      supabase
        .from('profiles')
        .select('id, display_name, ui_language, reader_language, part_of_day, reminder_at, reminder_duration_min, joined_on, role')
        .eq('id', session.user.id)
        .maybeSingle()

    let { data, error } = await fetchProfile()

    // A fresh install has no cache to fall back on, so a transient failure right
    // here — a network blip, or the auth context not being fully warm the instant
    // after verifyOtp resolves — must not be read as "this member has no profile"
    // and sent to onboarding, which would try to create a second one on top of
    // the real one. An existing profile is never actually absent, only
    // temporarily unreachable, so this is retried a few times before giving up.
    if (error && !current) {
      for (const delayMs of [400, 900, 1500]) {
        log.info('profile', 'profile fetch failed with nothing cached; retrying', {
          message: error.message,
        })
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        ;({ data, error } = await fetchProfile())
        if (!error) break
      }
    }

    if (!error && data) {
      current = data as ProfileRow
      setProfile(current)
      await setMeta(PROFILE_CACHE, JSON.stringify(current))
    } else if (error) {
      log.info('profile', 'could not refresh profile; using cache', { message: error.message })
    }

    const cachedToday = await ministryToday()
    setToday(cachedToday)

    if (current) setStreak(await localStreak(current.joined_on))
    setQueued(await pendingCount())
    setLoading(false)
  }, [session])

  const sync = useCallback(async (options: { force?: boolean; full?: boolean } = {}) => {
    const result = await syncNow(options)
    log.info('profile', 'sync finished', result)
    if (result.today) {
      await setMeta(META_TODAY, result.today)
      setToday(result.today)
    }
    await refresh()
  }, [refresh])

  useEffect(() => {
    void (async () => {
      await refresh()
      if (session) await sync({ force: true })
    })()
    // `sync` depends on `refresh`, which depends on the session; running on session
    // change is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  // Register for push once there is a profile to attach the device to. Failure is
  // not fatal: the app works perfectly well with notifications unavailable.
  useEffect(() => {
    if (!profile?.id) return
    void registerForPushNotifications()
    // Keyed on the id: `profile` is a fresh object on every sync, which had this
    // re-registering several times a minute.
  }, [profile?.id])

  // Content refreshes on foreground, which is also when a phone that has been in a
  // pocket all day rediscovers the network.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && session) void sync()
    })
    return () => sub.remove()
  }, [session, sync])

  // Signing out must not leave one person's reading history for the next. This
  // watches for an actual *change* of user: on a cold start the session is null
  // until it has been restored, and clearing then would wipe the offline cache
  // on every launch — visible only when there is no network to refill it.
  const previousUser = useRef<string | null>(null)
  useEffect(() => {
    if (sessionLoading) return
    const current = session?.user.id ?? null
    if (previousUser.current !== null && previousUser.current !== current) {
      log.info('profile', 'user changed; clearing local data')
      void clearLocalData()
    }
    previousUser.current = current
  }, [session, sessionLoading])

  const language: Language = profile?.ui_language ?? 'am'

  /* Audit mode (dev only): a forced count, so the design's streak states can be captured. */
  const shownStreak =
    streak && audit.streak !== undefined
      ? { ...streak, current: audit.streak, best: Math.max(streak.best, audit.streak) }
      : streak

  const value = useMemo<ProfileValue>(
    () => ({
      profile,
      streak: shownStreak,
      loading,
      today,
      queued,
      refresh,
      sync,
      language,
      t: (key, vars) => translate(key, language, vars),
    }),
    [profile, shownStreak, loading, today, queued, refresh, sync, language],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile must be used inside ProfileProvider')
  return value
}
