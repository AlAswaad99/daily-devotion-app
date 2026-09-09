import { clearStore } from './webStore'

/**
 * Web has no local database, so `meta` is just namespaced `localStorage` — the same
 * three exports `database.ts` provides natively, so nothing above this file needs to
 * know which platform it is running on.
 */

const PREFIX = 'abide:meta:'

export async function getMeta(key: string): Promise<string | null> {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    // Private browsing / storage disabled: behave as if nothing is cached yet.
    return null
  }
}

export async function setMeta(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(PREFIX + key, value)
  } catch {
    // Non-fatal: the app just re-fetches next time instead of reading a cache.
  }
}

/** Signing out must not leave the previous account's data cached for the next person. */
export async function clearLocalData(): Promise<void> {
  clearStore()
  try {
    localStorage.removeItem(PREFIX + META_LAST_PULL)
    localStorage.removeItem(PREFIX + META_STREAK)
    localStorage.removeItem(PREFIX + 'profile')
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

export const META_LAST_PULL = 'last_pull_at'
export const META_TODAY = 'ministry_today'
export const META_SERVER_TIME = 'server_time'
export const META_STREAK = 'server_streak'
