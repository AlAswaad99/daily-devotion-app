import { existsSync } from 'node:fs'
import path from 'node:path'
import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * Wraps app.json so the Firebase config is only referenced when it is actually
 * there.
 *
 * `google-services.json` is a credential and is not committed, so pointing at it
 * unconditionally would break the build for anyone who has not downloaded it —
 * including CI. Naming it only when it exists means push works the moment the file
 * appears, and nothing fails until then.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleServices = path.join(__dirname, 'google-services.json')
  const hasFirebase = existsSync(googleServices)

  return {
    ...config,
    name: config.name ?? 'Temuagn',
    slug: config.slug ?? 'temuagn',
    android: {
      ...config.android,
      ...(hasFirebase ? { googleServicesFile: './google-services.json' } : {}),
      // Android 13+ asks before it will show anything at all.
      permissions: ['NOTIFICATIONS', 'POST_NOTIFICATIONS'],
    },
    extra: {
      ...config.extra,
      // Surfaced so the app can say why push is unavailable rather than failing mute.
      hasFirebase,
    },
  }
}
