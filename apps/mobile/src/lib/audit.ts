import { useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Audit mode — development only.
 *
 * The pixel audit against the v3 design needs the app in states that are awkward or
 * impossible to reach from the UI on a signed-in dev account: an iOS-sized safe-top so
 * headers line up with the design frame, a streak of exactly 27 or 0, an evening sky
 * at ten in the morning, the second onboarding step with a half-typed code, a mascot
 * animation restarted at a known instant so a screen recording can be sliced at the
 * design's sampled times.
 *
 * Every override lives here, is read through `useAudit()`, and is inert unless `__DEV__`.
 * Nothing in a release build can reach it. Set it with a deep link:
 *
 *   temuagn://audit?insets=1&streak=27&sky=evening&to=/
 *   temuagn://audit?clear=1
 *
 * The state is persisted so it survives a Metro reload, which the emulator does often.
 */
export interface AuditState {
  /** Pretend the safe area is the design's: 44 on top, nothing below. */
  insets?: boolean
  /** Force the streak count shown on Today and the streak screen. */
  streak?: number
  /** Force the Today sky. */
  sky?: 'morning' | 'afternoon' | 'evening' | 'night'
  /** Leave onboarding and welcome reachable with a profile already in place. */
  noRedirect?: boolean
  /** Onboarding step and pre-filled values. */
  step?: 1 | 2 | 3
  code?: string
  name?: string
  remStart?: number
  remDuration?: number
  /** Restart the mascot animation after mount and flash a marker at t=0. */
  play?: boolean
  /** Play one named mascot move at the marker, instead of whatever the idle would do. */
  move?: string
}

const KEY = 'abide.audit'
let state: AuditState = {}
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())

export const auditEnabled = __DEV__

/** A stable reference so useSyncExternalStore doesn't see a "new" snapshot on every render. */
const EMPTY_STATE: AuditState = {}

export async function loadAudit(): Promise<void> {
  if (!auditEnabled) return
  try {
    const raw = await AsyncStorage.getItem(KEY)
    state = raw ? (JSON.parse(raw) as AuditState) : {}
  } catch {
    state = {}
  }
  emit()
}

export async function setAudit(next: AuditState): Promise<void> {
  if (!auditEnabled) return
  state = next
  emit()
  await AsyncStorage.setItem(KEY, JSON.stringify(next))
}

export const getAudit = (): AuditState => (auditEnabled ? state : EMPTY_STATE)

export function useAudit(): AuditState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getAudit,
    getAudit,
  )
}

/** Parse the deep-link query into state. Unknown keys are dropped. */
export function auditFromParams(params: Record<string, string | string[] | undefined>): AuditState {
  const one = (k: string) => {
    const v = params[k]
    return Array.isArray(v) ? v[0] : v
  }
  const next: AuditState = {}
  if (one('insets') === '1') next.insets = true
  if (one('streak') !== undefined) next.streak = Number(one('streak'))
  const sky = one('sky')
  if (sky === 'morning' || sky === 'afternoon' || sky === 'evening' || sky === 'night') next.sky = sky
  if (one('noRedirect') === '1') next.noRedirect = true
  const step = Number(one('step'))
  if (step === 1 || step === 2 || step === 3) next.step = step
  if (one('code') !== undefined) next.code = String(one('code'))
  if (one('name') !== undefined) next.name = String(one('name'))
  if (one('remStart') !== undefined) next.remStart = Number(one('remStart'))
  if (one('remDuration') !== undefined) next.remDuration = Number(one('remDuration'))
  if (one('play') === '1') next.play = true
  if (one('move') !== undefined) next.move = String(one('move'))
  return next
}
