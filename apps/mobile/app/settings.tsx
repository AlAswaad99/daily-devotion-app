import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import {
  formatWindow, fromSqlTime, PART_STARTS, toSqlTime, type Language,
} from '@abide/domain'
import { PaperBackdrop } from '../src/components/Backdrop'
import { DevotionTime } from '../src/components/onboarding/DevotionTime'
import { SettingsToggle } from '../src/components/SettingsToggle'
import { Kicker, PaperCard, ScreenHeader, Title, UiText } from '../src/components/ui'
import { useProfile } from '../src/lib/profile'
import { useSession } from '../src/lib/session'
import { getPreferences, setAllPreferences } from '../src/lib/notifications'
import { supabase } from '../src/lib/supabase'
import { translate } from '../src/lib/i18n'
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

  const version = Constants.expoConfig?.version ?? '1.0'

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          kicker={t('settingsKicker')}
          language={language}
          backLabel={t('back')}
          onBack={() => router.back()}
          style={styles.header}
        />

        <Title language={language} size={36} accessibilityRole="header" style={styles.title}>
          {t('settings')}
        </Title>

        <View style={styles.sections}>
          <Section label={t('sectionProfile')} language={language}>
            <View style={styles.row}>
              <UiText language={language} size={14.5} colour={theme.color.inkSecondary}>
                {t('nameRow')}
              </UiText>
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

          <View style={styles.section}>
            <Kicker language={language} style={styles.sectionLabel}>
              {t('sectionNotifications')}
            </Kicker>
            <PaperCard radius={theme.radius.xl} lift="none">
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <UiText language={language} size={15} colour={theme.color.ink} strong>
                    {t('dailyReminder')}
                  </UiText>
                  <UiText
                    language={language}
                    size={12}
                    colour={theme.color.inkMuted}
                    style={styles.rowSub}
                  >
                    {remindersOn
                      ? `${t('everyDayAt')} ${formatWindow(start, duration, language)}`
                      : t('reminderOff')}
                  </UiText>
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
            </PaperCard>

            {remindersOn && (
              <DevotionTime
                start={start}
                duration={duration}
                onStart={(next) => saveWindow(next, duration)}
                onDuration={(next) => saveWindow(start, next)}
                language={language}
              />
            )}
          </View>

          <View style={styles.section}>
            {/*
              * One "LANGUAGE" heading, as the design draws it — the design has only
              * one language setting to put under it. This app has two: `reader_language`
              * is its own column, and the Bible reader picks its translation from it, so
              * folding the two rows into one control would quietly lock scripture to
              * whatever the interface is set to. Both rows live under the one kicker
              * instead, each named by the smaller label above it.
              */}
            <Kicker language={language} style={styles.sectionLabel}>
              {t('sectionLanguage')}
            </Kicker>
            <View style={styles.languageGroup}>
              <UiText language={language} size={12} colour={theme.color.inkMuted} style={styles.languageRowLabel}>
                {t('uiLanguage')}
              </UiText>
              <LanguageCards
                value={profile?.ui_language ?? language}
                onChange={chooseUiLanguage}
                language={language}
              />

              <UiText language={language} size={12} colour={theme.color.inkMuted} style={styles.languageRowLabel}>
                {t('readerLanguage')}
              </UiText>
              <LanguageCards
                value={profile?.reader_language ?? language}
                onChange={(next) => void patch({ reader_language: next })}
                language={language}
              />
            </View>
          </View>

          <Section label={t('sectionAccount')} language={language}>
            <Pressable
              accessibilityRole="button"
              style={styles.row}
              onPress={() => void signOut().then(() => router.replace('/welcome'))}
            >
              <UiText language={language} size={15} colour={theme.color.ink} strong>
                {t('signOut')}
              </UiText>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              style={styles.row}
              disabled={busy}
              onPress={confirmDelete}
            >
              <UiText language={language} size={15} colour={theme.color.danger} strong>
                {t('deleteMyData')}
              </UiText>
              {busy ? <ActivityIndicator color={theme.color.danger} /> : <Text style={styles.chevron}>›</Text>}
            </Pressable>
          </Section>

          <View style={styles.footer}>
            {/*
              * The way back to the front door, for someone who wants to start over
              * without losing their account. It signs nothing out and deletes nothing —
              * onboarding simply runs again over the profile that is already there.
              */}
            <Pressable
              accessibilityRole="button"
              style={styles.restart}
              onPress={() => router.replace('/onboarding?restart=1')}
            >
              <UiText language={language} size={12.5} colour={theme.color.accent} strong>
                {t('restartOnboarding')}
              </UiText>
            </Pressable>
            <UiText language={language} size={11} colour={theme.color.footnote}>
              Abide {version}
            </UiText>
          </View>
        </View>
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
      <Kicker language={language} style={styles.sectionLabel}>
        {label}
      </Kicker>
      <PaperCard radius={theme.radius.xl} lift="none" style={styles.card}>
        {children}
      </PaperCard>
    </View>
  )
}

/** Two cards side by side, each a script tag and its name. */
function LanguageCards({
  value,
  onChange,
  language,
}: {
  value: Language
  onChange: (next: Language) => void
  language: Language
}) {
  return (
    <View style={styles.langRow}>
      {(['en', 'am'] as const).map((code) => {
        const on = value === code
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.langCard, on && styles.langCardOn]}
            onPress={() => onChange(code)}
          >
            <View style={[styles.langChip, on && styles.langChipOn]}>
              <Text
                style={[
                  styles.langChipText,
                  { fontFamily: fonts(code).labelStrong },
                  on && styles.langChipTextOn,
                ]}
              >
                {code === 'en' ? 'EN' : 'አማ'}
              </Text>
            </View>
            <UiText
              language={code}
              size={14.5}
              colour={on ? theme.color.onInk : theme.color.inkSecondary}
            >
              {code === 'en' ? 'English' : 'አማርኛ'}
            </UiText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  body: { paddingBottom: 40 },
  header: { paddingHorizontal: 20 },
  title: { paddingHorizontal: 26, paddingTop: 14 },

  sections: { paddingHorizontal: 20, paddingTop: 22, gap: 22 },
  section: { gap: 8 },
  sectionLabel: { paddingLeft: 6 },
  card: {},

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  rowText: { flex: 1 },
  rowSub: { marginTop: 3, lineHeight: 15 },
  /* Android's font padding lands on any bare `<Text>` that isn't a shared primitive. */
  chevron: {
    fontSize: 18,
    lineHeight: 21,
    color: theme.color.inkFaint,
    includeFontPadding: false,
  },
  divider: { height: 1, backgroundColor: theme.color.panel },

  inlineInput: {
    flex: 1,
    /*
     * Fixed height, not intrinsic.
     *
     * An Android text input claims about forty points of minimum height whatever its
     * font, which made this row half as tall again as the design's and pushed every
     * section below it down the page.
     */
    height: 19,
    textAlign: 'right',
    fontSize: 16,
    color: theme.color.ink,
    paddingVertical: 0,
  },

  languageGroup: { gap: 8 },
  languageRowLabel: { paddingLeft: 6 },
  langRow: { flexDirection: 'row', gap: 10 },
  langCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  langCardOn: { backgroundColor: theme.color.inkDeep, borderColor: theme.color.inkDeep },
  langChip: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.panel,
  },
  langChipOn: { backgroundColor: 'rgba(169,200,106,.2)' },
  langChipText: {
    fontSize: 11,
    lineHeight: 13,
    color: theme.color.kicker,
    includeFontPadding: false,
  },
  langChipTextOn: { color: theme.color.accentBright },

  footer: { alignItems: 'center', gap: 8, paddingTop: 6 },
  restart: { paddingVertical: 8, paddingHorizontal: 14 },
})
