import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

/**
 * Do Not Disturb and screen pinning, on Android.
 *
 * `requireOptionalNativeModule` rather than the throwing form: iOS has no equivalent
 * and never will without Apple's Screen Time entitlement, and a JS bundle running
 * before a native rebuild has no module either. Both cases must degrade to a plain
 * timer rather than crash the Focus tab.
 */
interface TemuagnFocusNative {
  canSilence(): boolean
  openSettings(): void
  isSilencing(): boolean
  begin(durationMs: number): void
  end(): void
  /** True when it found the phone still silenced and put it back. */
  repair(): boolean
  pin(): boolean
  unpin(): boolean
}

const native = requireOptionalNativeModule<TemuagnFocusNative>('TemuagnFocus')

/** Whether this build can silence notifications at all. */
export const canBlock = (): boolean => Platform.OS === 'android' && native !== null

export const canSilence = (): boolean => native?.canSilence() ?? false

export const openSettings = (): void => native?.openSettings()

export const isSilencing = (): boolean => native?.isSilencing() ?? false

export const beginSession = (durationMs: number): void => native?.begin(durationMs)

export const endSession = (): void => native?.end()

/**
 * Called on launch, before anything else touches Focus.
 *
 * The one thing this whole module exists to prevent is a member's phone staying
 * silent after a session they walked away from. Everything else is convenience.
 */
export const repair = (): boolean => native?.repair() ?? false

export const pin = (): boolean => native?.pin() ?? false

export const unpin = (): boolean => native?.unpin() ?? false
