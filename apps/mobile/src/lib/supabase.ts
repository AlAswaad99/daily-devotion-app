import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { createClient } from '@supabase/supabase-js'

const configuredUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!configuredUrl || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in from `supabase start`.',
  )
}

/**
 * On a phone, `localhost` is the phone — not the machine running Supabase. Rather
 * than making every developer hand-edit .env with today's LAN address, borrow the
 * host Expo is already serving this bundle from, which is by definition reachable
 * from the device. Only the host is taken; the port and scheme stay as configured.
 *
 * A non-local URL (staging, production) is left exactly as written.
 */
function resolveLocalUrl(raw: string): string {
  const url = new URL(raw)
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) return raw

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost
  const devHost = hostUri?.split(':')[0]
  if (!devHost) return raw

  url.hostname = devHost
  return url.toString().replace(/\/$/, '')
}

export const supabaseUrl = resolveLocalUrl(configuredUrl)

/**
 * The app only ever holds the anon key. Every read is filtered by the RLS policies
 * in supabase/migrations — notably, no key shipped in this bundle can read another
 * user's reflections.
 */
export const supabase = createClient(supabaseUrl, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
