import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useProfile } from '../src/lib/profile'
import { useSession } from '../src/lib/session'
import {
  getPreferences, MEMBER_FACING_KINDS, setPreference, type NotificationKind,
} from '../src/lib/notifications'
import { theme } from '../src/lib/theme'
import { lineHeightFor } from '../src/lib/i18n'

/**
 * Notification preferences.
 *
 * Every kind is on unless turned off here — a member opts out, never in. The
 * dashboard shows the ministry how many people have muted each kind, which is the
 * feedback loop that stops the ladder becoming something people delete the app over.
 */
export default function Settings() {
  const { t, language, profile } = useProfile()
  const { signOut } = useSession()
  const router = useRouter()

  const [prefs, setPrefs] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const current = await getPreferences()
      if (!cancelled) {
        setPrefs(current)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback(async (kind: NotificationKind, next: boolean) => {
    setPrefs((p) => ({ ...p, [kind]: next }))
    await setPreference(kind, next)
  }, [])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('settingsTitle')}</Text>

      {profile && (
        <View style={styles.card}>
          <Text style={styles.name}>{profile.display_name}</Text>
          <Text style={styles.meta}>
            {profile.ui_language === 'am' ? t('amharic') : t('english')} ·{' '}
            {t(profile.part_of_day)}
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>{t('notificationsTitle')}</Text>
      <Text style={[styles.help, { lineHeight: lineHeightFor(language, theme.size.label) }]}>
        {t('notificationsHelp')}
      </Text>

      <View style={styles.card}>
        {MEMBER_FACING_KINDS.map((kind, index) => (
          <View
            key={kind}
            style={[styles.row, index > 0 && styles.rowDivided]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t(`notif_${kind}` as never)}</Text>
              <Text style={styles.rowHelp}>{t(`notif_${kind}_help` as never)}</Text>
            </View>
            <Switch
              value={prefs[kind] ?? true}
              onValueChange={(next) => void toggle(kind, next)}
              trackColor={{ true: theme.color.flame }}
            />
          </View>
        ))}
      </View>

      <Pressable style={styles.signOut} onPress={() => void signOut().then(() => router.replace('/'))}>
        <Text style={styles.signOutText}>{t('signOut')}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.space(3), paddingTop: theme.space(8), gap: theme.space(1.5) },
  title: { fontFamily: theme.font.body,
    fontSize: theme.size.display, fontWeight: '700', color: theme.color.ink },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2),
  },
  name: { fontFamily: theme.font.body,
    fontSize: theme.size.body, fontWeight: '600', color: theme.color.ink },
  meta: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  sectionLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.inkMuted,
    marginTop: theme.space(2),
  },
  help: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    paddingVertical: theme.space(1.25),
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: theme.color.line },
  rowTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.ink },
  rowHelp: { fontFamily: theme.font.body,
    fontSize: theme.size.micro, color: theme.color.inkMuted },
  signOut: { alignSelf: 'center', marginTop: theme.space(3), padding: theme.space(1) },
  signOutText: { color: theme.color.inkMuted },
})
