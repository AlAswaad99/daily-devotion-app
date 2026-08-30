import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'
import { log } from './log'

/**
 * Device registration and per-member preferences.
 *
 * The ladder itself is decided on the server — see `plan_notifications` — so the
 * app's job here is small: ask permission once, hand over a token, and let someone
 * turn individual kinds off. What arrives, and how often, is not the client's
 * decision, which is why the two-per-day cap cannot be circumvented by a stale app.
 */

/**
 * How a notification behaves while the app is open.
 *
 * Without this, a push that arrives in the foreground is delivered silently to the
 * JS listener and never shown — which reads as "notifications are broken" when
 * testing with the app on screen, because that is exactly when you are looking.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

export const NOTIFICATION_KINDS = [
  'daily_reminder',
  'streak_at_risk',
  'streak_lost',
  'repair_available',
  'comeback_d3',
  'comeback_d7',
  'comeback_d14',
  'milestone',
  'book_complete',
  'round_start',
  'broadcast',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/** Kinds a member is realistically going to want to manage themselves. */
export const MEMBER_FACING_KINDS: NotificationKind[] = [
  'daily_reminder',
  'streak_at_risk',
  'streak_lost',
  'repair_available',
  'comeback_d3',
  'comeback_d7',
  'milestone',
  'book_complete',
  'round_start',
  'broadcast',
]

export async function registerForPushNotifications(): Promise<string | null> {
  // A simulator has no push token, and asking for one throws rather than failing
  // softly, so it is not asked.
  if (!Device.isDevice) {
    log.info('notifications', 'not a physical device; skipping registration')
    return null
  }

  const existing = await Notifications.getPermissionsAsync()
  let status = existing.status

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync()
    status = requested.status
  }

  if (status !== 'granted') {
    log.info('notifications', 'permission not granted')
    return null
  }

  try {
    const token = await Notifications.getDevicePushTokenAsync()
    const value = String(token.data)

    const { error } = await supabase.from('devices').upsert(
      {
        fcm_token: value,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        last_seen: new Date().toISOString(),
      },
      { onConflict: 'fcm_token' },
    )

    log.result('notifications', 'register device', { error, data: { platform: Platform.OS } })
    return value
  } catch (error) {
    // No FCM credential in the build yet — expected until the Firebase project
    // exists. The rest of the app must not care.
    log.info('notifications', 'could not obtain a push token', {
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export interface KindPreference {
  kind: NotificationKind
  enabled: boolean
}

/** Absent means on: a member has to opt out, not in. */
export async function getPreferences(): Promise<Record<string, boolean>> {
  const { data } = await supabase.from('notification_prefs').select('kind, enabled')
  const rows = (data as KindPreference[] | null) ?? []
  return Object.fromEntries(rows.map((r) => [r.kind, r.enabled]))
}

export async function setPreference(kind: NotificationKind, enabled: boolean): Promise<void> {
  const { data: session } = await supabase.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return

  await supabase
    .from('notification_prefs')
    .upsert({ user_id: userId, kind, enabled }, { onConflict: 'user_id,kind' })

  log.info('notifications', `preference ${kind} -> ${enabled ? 'on' : 'off'}`)
}
