import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  formatWindow, fromSqlTime, PART_STARTS, toSqlTime, type Language,
} from '@abide/domain'
import { PaperBackdrop } from '../src/components/Backdrop'
import { DevotionTime } from '../src/components/onboarding/DevotionTime'
import { SettingsToggle } from '../src/components/SettingsToggle'
import { useProfile } from '../src/lib/profile'
import { useSession } from '../src/lib/session'
import { getPreferences, setAllPreferences } from '../src/lib/notifications'
import { supabase } from '../src/lib/supabase'
import { translate, lineHeightFor } from '../src/lib/i18n'
import { log } from '../src/lib/log'
import { LANGUAGE_KEY } from '../src/lib/language'
import { fonts, theme } from '../src/lib/theme'

/**
 * Everything a member can change about their own account.
 *
 * One reminder switch rather than the ten kinds the planner distinguishes, by
 * decision — so it writes every member-facing kind at once, and "off" means off. The
 * per-kind screen this replaced is gone; the dashboard still reports the same numbers,
 * because they come from the same rows.
 *
 * Writes go straight through on change instead of collecting behind a Save button.
 * There is nothing here where a half-finished edit is meaningful, and a settings screen
 * that can be left in an unsaved state is a settings screen that lies.
 */
export default function Settings() {
  const { profile, language, refresh } = useProfile()
  const { signOut } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [name, setName] = useState(profile?.display_name ?? '')
  const [remindersOn, setRemindersOn] = useState(true)
  const [start, setStart] = useState(PART_STARTS.morning)
  const [duration, setDuration] = useState(30)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const prefs = await getPreferences()
      if (cancelled) return
      /*
       * The switch is on unless something is off. A member opts out, never in, so a
       * profile with no rows yet — one created before the master switch existed — reads
       * as on rather than as a mystery.
       */
      const values = Object.values(prefs)
      setRemindersOn(values.length === 0 || values.some(Boolean))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!profile) return
    setName(profile.display_name)
    if (profile.reminder_at) setStart(fromSqlTime(profile.reminder_at))
    if (profile.reminder_duration_min) setDuration(profile.reminder_duration_min)
  }, [profile])

  const t = useCallback(
    (key: Parameters<typeof translate>[0]) => translate(key, language),
    [language],
  )
  const f = fonts(language)

  const patch = useCallback(
    async (values: Record<string, unknown>) => {
      if (!profile) return
      const { error } = await supabase.from('profiles').update(values).eq('id', profile.id)
      if (error) {
        log.info('settings', 'could not save', { message: error.message })
        return
      }
      await refresh()
    },
    [profile, refresh],
  )

  /* The window is two columns; saving them together keeps the trigger's derivation honest. */
  const saveWindow = useCallback(
    (nextStart: number, nextDuration: number) => {
      setStart(nextStart)
      setDuration(nextDuration)
      void patch({
        reminder_at: toSqlTime(nextStart),
        reminder_duration_min: nextDuration,
      })
    },
    [patch],
  )

  const chooseUiLanguage = (next: Language) => {
    void AsyncStorage.setItem(LANGUAGE_KEY, next)
    void patch({ ui_language: next })
  }

  const confirmDelete = () => {
    Alert.alert(t('deleteConfirmTitle'), t('deleteConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true)
            const { error } = await supabase.rpc('delete_my_data')
            log.info('settings', 'delete_my_data', { error: error?.message ?? null })
            setBusy(false)
            if (error) return
            /*
             * Sign out rather than refresh. The profile is gone, so staying signed in
             * would drop them into onboarding as themselves — which is not what "delete
             * my data" is meant to feel like.
             */
            await signOut()
            router.replace('/welcome')
          })()
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperBackdrop />
        <ActivityIndicator color={theme.color.accent} />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          hitSlop={10}
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={[styles.kicker, { fontFamily: f.label }]}>{t('settingsKicker')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + theme.space(6) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: f.title }]}>
          {t('settings')}
        </Text>

        <Section label={t('sectionProfile')} language={language}>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { fontFamily: f.body }]}>{t('nameRow')}</Text>
            <TextInput
              style={[styles.inlineInput, { fontFamily: f.body }]}
              value={name}
              onChangeText={setName}
              onEndEditing={() => {
                const trimmed = name.trim()
                if (trimmed.length > 0 && trimmed !== profile?.display_name) {
                  void patch({ display_name: trimmed })
                } else {
                  setName(profile?.display_name ?? '')
                }
              }}
              returnKeyType="done"
            />
          </View>
        </Section>

        <Section label={t('sectionNotifications')} language={language}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { fontFamily: f.body }]}>{t('dailyReminder')}</Text>
              <Text style={[styles.rowSub, { fontFamily: f.body }]}>
                {remindersOn
                  ? `${t('everyDayAt')} ${formatWindow(start, duration, language)}`
                  : t('reminderOff')}
              </Text>
            </View>
            <SettingsToggle
              value={remindersOn}
              accessibilityLabel={t('dailyReminder')}
              onChange={(next) => {
                setRemindersOn(next)
                void setAllPreferences(next)
              }}
            />
          </View>
        </Section>

        {remindersOn && (
          <View style={styles.window}>
            <DevotionTime
              start={start}
              duration={duration}
              onStart={(next) => saveWindow(next, duration)}
              onDuration={(next) => saveWindow(start, next)}
              language={language}
            />
          </View>
        )}

        <Section label={t('sectionLanguage')} language={language}>
          <LanguageRow
            label={t('uiLanguage')}
            value={profile?.ui_language ?? language}
            onChange={chooseUiLanguage}
            language={language}
          />
          <View style={styles.divider} />
          <LanguageRow
            label={t('readerLanguage')}
            value={profile?.reader_language ?? language}
            onChange={(next) => void patch({ reader_language: next })}
            language={language}
          />
        </Section>

        <Section label={t('sectionAccount')} language={language}>
          <Pressable
            accessibilityRole="button"
            style={styles.row}
            onPress={() => void signOut().then(() => router.replace('/welcome'))}
          >
            <Text style={[styles.rowLabel, { fontFamily: f.body }]}>{t('signOut')}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            style={styles.row}
            disabled={busy}
            onPress={confirmDelete}
          >
            <Text style={[styles.rowLabel, styles.danger, { fontFamily: f.body }]}>
              {t('deleteMyData')}
            </Text>
            {busy && <ActivityIndicator color={theme.color.danger} />}
          </Pressable>
        </Section>

        <Text style={[styles.version, { fontFamily: f.body }]}>{t('appVersion')}</Text>
      </ScrollView>
    </View>
  )
}

function Section({
  label,
  language,
  children,
}: {
  label: string
  language: Language
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { fontFamily: fonts(language).label }]}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  )
}

function LanguageRow({
  label,
  value,
  onChange,
  language,
}: {
  label: string
  value: Language
  onChange: (next: Language) => void
  language: Language
}) {
  const f = fonts(language)
  return (
    <View style={styles.langRow}>
      <Text style={[styles.rowLabel, { fontFamily: f.body }]}>{label}</Text>
      <View style={styles.langChoices}>
        {(['en', 'am'] as const).map((code) => {
          const on = value === code
          return (
            <Pressable
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.langChip, on && styles.langChipOn]}
              onPress={() => onChange(code)}
            >
              <Text
                style={[
                  styles.langChipText,
                  { fontFamily: fonts(code).label },
                  on && styles.langChipTextOn,
                ]}
              >
                {code === 'en' ? 'EN' : 'አማርኛ'}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    paddingHorizontal: theme.layout.screenPadding,
  },
  backButton: {
    width: theme.layout.backButton,
    height: theme.layout.backButton,
    borderRadius: theme.layout.backButton / 2,
    backgroundColor: theme.color.inkDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backArrow: { fontSize: 17, color: theme.color.accentBright, lineHeight: 20 },
  kicker: {
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.kicker,
  },

  body: { paddingHorizontal: theme.layout.screenPadding, paddingTop: theme.space(2) },
  title: { fontSize: 36, lineHeight: 38, color: theme.color.ink },

  section: { marginTop: theme.space(3.5) },
  sectionLabel: {
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.kicker,
    marginBottom: theme.space(1),
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space(1.5),
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15.5, color: theme.color.inkBody },
  rowSub: { marginTop: 2, fontSize: 12.5, color: theme.color.inkMuted },
  danger: { color: theme.color.danger },
  divider: { height: 1, backgroundColor: theme.color.line, marginHorizontal: 14 },

  inlineInput: {
    flex: 1,
    textAlign: 'right',
    fontSize: 15.5,
    color: theme.color.ink,
    paddingVertical: 0,
  },

  window: { marginTop: theme.space(1) },

  langRow: { paddingVertical: 12, paddingHorizontal: 14, gap: theme.space(1) },
  langChoices: { flexDirection: 'row', gap: 8 },
  langChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.sm + 4,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.field,
    alignItems: 'center',
  },
  langChipOn: { backgroundColor: theme.color.inkDeep, borderColor: theme.color.inkDeep },
  langChipText: { fontSize: 13, color: theme.color.inkSecondary },
  langChipTextOn: { color: theme.color.onInk },

  version: {
    marginTop: theme.space(4),
    textAlign: 'center',
    fontSize: 12,
    color: theme.color.inkFaint,
  },
})
