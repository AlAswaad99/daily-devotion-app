import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect, useRouter } from 'expo-router'
import { PARTS_OF_DAY, type Language, type PartOfDay } from '@abide/domain'
import { supabase } from '../src/lib/supabase'
import { useSession } from '../src/lib/session'
import { useProfile } from '../src/lib/profile'
import { translate } from '../src/lib/i18n'
import { log } from '../src/lib/log'
import { LANGUAGE_KEY } from '../src/lib/language'
import { theme } from '../src/lib/theme'

/**
 * Welcome → join code → language → part of day.
 *
 * The join code is what binds the account to a church and ministry, so it comes
 * first: without it there is no tenancy and nothing else can be saved. Part of day
 * sets the default reminder time (the reminders themselves are Phase 6).
 *
 * No guest browsing, by decision.
 */
export default function Onboarding() {
  const { session, signOut } = useSession()
  const { profile, refresh } = useProfile()
  const router = useRouter()

  const [language, setLanguage] = useState<Language>('am')

  // Carry over the choice made on the sign-in screen rather than asking twice.
  useEffect(() => {
    void AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'am') setLanguage(stored)
    })
  }, [])
  const [displayName, setDisplayName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [partOfDay, setPartOfDay] = useState<PartOfDay>('morning')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const t = (key: Parameters<typeof translate>[0]) => translate(key, language)

  if (!session) return <Redirect href="/sign-in" />
  if (profile) return <Redirect href="/" />

  const submit = async () => {
    setBusy(true)
    setError(null)
    log.info('onboarding', 'redeeming join code', {
      code: joinCode.trim().toUpperCase(),
      language,
      partOfDay,
    })
    const result = await supabase.rpc('redeem_join_code', {
      p_code: joinCode.trim(),
      p_display_name: displayName.trim(),
      p_ui_language: language,
      p_part_of_day: partOfDay,
    })
    log.result('onboarding', 'redeem_join_code', result)
    setBusy(false)
    if (result.error) {
      // 23503 on profiles_id_fkey means the signed-in account no longer exists on
      // the server. The token is still valid, so nothing else reveals it — and no
      // amount of retrying here will help. Clear the session and start over.
      if (result.error.code === '23503') {
        log.info('onboarding', 'signed-in account no longer exists; clearing session')
        await signOut()
        return
      }
      setError(result.error.message)
      return
    }
    await refresh()
    router.replace('/')
  }

  const ready = displayName.trim().length > 0 && joinCode.trim().length > 0

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t('welcome')}</Text>

      <Text style={styles.label}>{t('language')}</Text>
      <View style={styles.row}>
        {(['am', 'en'] as const).map((code) => (
          <Pressable
            key={code}
            style={[styles.choice, language === code && styles.choiceOn]}
            onPress={() => {
              setLanguage(code)
              void AsyncStorage.setItem(LANGUAGE_KEY, code)
            }}
          >
            <Text style={[styles.choiceText, language === code && styles.choiceTextOn]}>
              {code === 'am' ? 'አማርኛ' : 'English'}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholder={language === 'am' ? 'ስምህ' : 'Your name'}
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        placeholder={language === 'am' ? 'የመቀላቀያ ኮድ' : 'Join code'}
        autoCapitalize="characters"
        value={joinCode}
        onChangeText={setJoinCode}
      />

      <Text style={styles.label}>{t('whenDoYouRead')}</Text>
      <View style={styles.row}>
        {PARTS_OF_DAY.map((part) => (
          <Pressable
            key={part}
            style={[styles.choice, partOfDay === part && styles.choiceOn]}
            onPress={() => setPartOfDay(part)}
          >
            <Text style={[styles.choiceText, partOfDay === part && styles.choiceTextOn]}>
              {translate(part, language)}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.submit, !ready && styles.submitOff]}
        onPress={submit}
        disabled={!ready || busy}
      >
        {busy ? (
          <ActivityIndicator color={theme.color.surface} />
        ) : (
          <Text style={styles.submitText}>{t('continueLabel')}</Text>
        )}
      </Pressable>

      {/* Without this a bad join code, or a deleted account, is a dead end. */}
      <Pressable onPress={() => void signOut()}>
        <Text style={styles.escape}>{t('useAnotherAccount')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.color.bg,
    padding: theme.space(3),
    justifyContent: 'center',
    gap: theme.space(1.5),
  },
  title: { fontSize: theme.size.display, fontWeight: '700', color: theme.color.ink },
  label: {
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.inkMuted,
    marginTop: theme.space(1),
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) },
  choice: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(1),
    paddingHorizontal: theme.space(2),
    backgroundColor: theme.color.surface,
  },
  choiceOn: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
  choiceText: { color: theme.color.ink },
  choiceTextOn: { color: theme.color.surface, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.surface,
    paddingHorizontal: theme.space(1.75),
    paddingVertical: theme.space(1.5),
    fontSize: theme.size.body,
  },
  submit: {
    marginTop: theme.space(2),
    backgroundColor: theme.color.ink,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(2),
    alignItems: 'center',
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: theme.color.surface, fontWeight: '700', fontSize: theme.size.body },
  error: { color: theme.color.danger },
  escape: {
    textAlign: 'center',
    marginTop: theme.space(1.5),
    color: theme.color.inkMuted,
    fontSize: theme.size.label,
  },
})
