import { useEffect, useState } from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text,
  TextInput, View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect } from 'expo-router'
import type { Language } from '@abide/domain'
import { supabase } from '../src/lib/supabase'
import { useSession } from '../src/lib/session'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PaperBackdrop } from '../src/components/Backdrop'
import { PrimaryButton } from '../src/components/PrimaryButton'
import { Body, Kicker, Title } from '../src/components/ui'
import { translate } from '../src/lib/i18n'
import { log } from '../src/lib/log'
import { fonts, theme } from '../src/lib/theme'
import { LANGUAGE_KEY } from '../src/lib/language'
import { useAudit } from '../src/lib/audit'

/**
 * Authentication only. The join code, language and part of day belong to
 * onboarding — this screen used to collect them too, which meant two different
 * places could create a profile.
 *
 * Email + password is the development default, not a decision (OPEN_QUESTIONS Q12).
 * Everything provider-specific is confined to this file and `supabase.auth`, so
 * adding Google or phone/OTP later touches nothing else.
 *
 * The design has no frame for this screen — it assumes a code is the whole of joining.
 * It is dressed in the onboarding chrome anyway: the same paper ground, language pill,
 * kicker, title and lime button, because it is the first paper screen a new member
 * sees and an unstyled one here would read as a different app.
 */
export default function SignIn() {
  const { session, loading } = useSession()
  const insets = useSafeAreaInsets()
  const audit = useAudit()
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [language, setLanguage] = useState<Language>('am')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Remember the choice so onboarding opens in the language they just picked.
  useEffect(() => {
    void AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'am') setLanguage(stored)
    })
  }, [])

  const chooseLanguage = (next: Language) => {
    setLanguage(next)
    void AsyncStorage.setItem(LANGUAGE_KEY, next)
  }

  const t = (key: Parameters<typeof translate>[0]) => translate(key, language)

  // Signing in changes the session, and the router needs telling. Without this the
  // buttons appear to do nothing: the account is created, but the screen stays put.
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  if (session && !audit.noRedirect) return <Redirect href="/" />

  const submit = async () => {
    setBusy(true)
    setError(null)
    const credentials = { email: email.trim(), password }
    log.info('sign-in', `${mode} attempt`, { email: credentials.email })

    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials)

    log.result('sign-in', mode, {
      error: result.error,
      data: { user: result.data?.user?.email ?? null, session: Boolean(result.data?.session) },
    })
    setBusy(false)

    if (result.error) {
      // "Invalid login credentials" covers both a wrong password and an account
      // that does not exist, which is exactly the confusion to head off here.
      setError(
        result.error.message.toLowerCase().includes('invalid login')
          ? t('invalidCredentials')
          : result.error.message,
      )
      return
    }

    // Signing up with confirmations disabled returns a session immediately. If it
    // ever does not, say so rather than leaving the user on a screen that looks stuck.
    if (!result.data.session) {
      log.info('sign-in', 'no session returned; email confirmation is probably on')
      setError(t('checkYourEmail'))
    }
    // On success the session updates and the redirect above takes over: to
    // onboarding if there is no profile yet, otherwise to Today.
  }

  const ready = email.trim().length > 0 && password.length >= 6

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PaperBackdrop />

      <View style={[styles.languagePill, { top: insets.top }]}>
        {(['en', 'am'] as const).map((code, i) => (
          <View key={code} style={styles.pillItem}>
            {i === 1 && <View style={styles.pillDivider} />}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: language === code }}
              hitSlop={6}
              onPress={() => chooseLanguage(code)}
            >
              <Text
                style={[
                  code === 'en' ? styles.pillEn : styles.pillAm,
                  { fontFamily: fonts(code).labelStrong },
                  language === code ? styles.pillOn : styles.pillOff,
                ]}
              >
                {code === 'en' ? 'EN' : 'አማ'}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.body}>
        <Kicker language={language}>{t('appName')}</Kicker>
        <Title language={language} size={36} accessibilityRole="header" style={styles.title}>
          {mode === 'signIn' ? t('signIn') : t('createAccount')}
        </Title>
        <Body language={language} colour={theme.color.inkSecondary} style={styles.subtitle}>
          {mode === 'signIn' ? t('signInSubtitle') : t('signUpSubtitle')}
        </Body>

        <TextInput
          style={[styles.input, { fontFamily: fonts(language).body }]}
          placeholder={t('email')}
          placeholderTextColor={theme.color.inkMuted}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={[styles.input, { fontFamily: fonts(language).body }]}
          placeholder={t('password')}
          placeholderTextColor={theme.color.inkMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {error !== null && (
          <Body language={language} size={14} colour={theme.color.danger} style={styles.error}>
            {error}
          </Body>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <PrimaryButton
          language={language}
          label={mode === 'signIn' ? t('signIn') : t('createAccount')}
          enabled={ready}
          busy={busy}
          arrow={false}
          onPress={() => void submit()}
        />
        <Pressable
          accessibilityRole="button"
          style={styles.switch}
          onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
        >
          <Text style={[styles.switchText, { fontFamily: fonts(language).label }]}>
            {mode === 'signIn' ? t('needAnAccount') : t('haveAnAccount')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* The onboarding pill, so the choice looks the same in both places it is offered. */
  languagePill: {
    position: 'absolute',
    right: 20,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.inkDeep,
  },
  pillItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pillDivider: { width: 1, height: 11, backgroundColor: 'rgba(255,255,255,.28)' },
  pillEn: { fontSize: 10, letterSpacing: 1 },
  pillAm: { fontSize: 11 },
  pillOn: { color: theme.color.accentBright },
  pillOff: { color: theme.color.onInkDim },

  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
  title: { marginTop: 6 },
  subtitle: { marginBottom: 12 },
  input: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 17,
    color: theme.color.ink,
  },
  error: { marginTop: 4 },

  footer: { paddingHorizontal: 24, gap: 6 },
  switch: { alignItems: 'center', paddingVertical: 13 },
  switchText: { fontSize: 13.5, color: theme.color.kicker },
})
