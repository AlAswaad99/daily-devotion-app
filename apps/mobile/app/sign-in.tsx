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
import { translate } from '../src/lib/i18n'
import { theme } from '../src/lib/theme'
import { LANGUAGE_KEY } from '../src/lib/language'

/**
 * Authentication only. The join code, language and part of day belong to
 * onboarding — this screen used to collect them too, which meant two different
 * places could create a profile.
 *
 * Email + password is the development default, not a decision (OPEN_QUESTIONS Q12).
 * Everything provider-specific is confined to this file and `supabase.auth`, so
 * adding Google or phone/OTP later touches nothing else.
 */
export default function SignIn() {
  const { session, loading } = useSession()
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
  if (session) return <Redirect href="/" />

  const submit = async () => {
    setBusy(true)
    setError(null)
    const credentials = { email: email.trim(), password }
    const { error } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials)
    setBusy(false)
    if (error) setError(error.message)
    // On success the session updates and the redirect above takes over: to
    // onboarding if there is no profile yet, otherwise to Today.
  }

  const ready = email.trim().length > 0 && password.length >= 6

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.languageRow}>
        {(['en', 'am'] as const).map((code) => (
          <Pressable key={code} onPress={() => chooseLanguage(code)}>
            <Text style={[styles.languageChip, language === code && styles.languageChipOn]}>
              {code === 'en' ? 'EN' : 'አማ'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.title}>{t('appName')}</Text>
      <Text style={styles.subtitle}>
        {mode === 'signIn' ? t('signInSubtitle') : t('signUpSubtitle')}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={t('email')}
        placeholderTextColor={theme.color.inkMuted}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder={t('password')}
        placeholderTextColor={theme.color.inkMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, !ready && styles.buttonOff]}
        onPress={submit}
        disabled={busy || !ready}
      >
        {busy ? (
          <ActivityIndicator color={theme.color.surface} />
        ) : (
          <Text style={styles.buttonText}>
            {mode === 'signIn' ? t('signIn') : t('createAccount')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
        <Text style={styles.switch}>
          {mode === 'signIn' ? t('needAnAccount') : t('haveAnAccount')}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.space(3),
    gap: theme.space(1.5),
    backgroundColor: theme.color.bg,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  languageRow: {
    position: 'absolute',
    top: theme.space(7),
    right: theme.space(3),
    flexDirection: 'row',
    gap: theme.space(1),
  },
  languageChip: {
    fontSize: theme.size.label,
    color: theme.color.inkMuted,
    paddingHorizontal: theme.space(1),
    paddingVertical: theme.space(0.5),
  },
  languageChipOn: { color: theme.color.ink, fontWeight: '700' },
  title: { fontSize: 40, fontWeight: '700', color: theme.color.ink },
  subtitle: {
    fontSize: theme.size.body,
    color: theme.color.inkMuted,
    marginBottom: theme.space(1.5),
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(1.75),
    paddingVertical: theme.space(1.5),
    fontSize: theme.size.body,
    color: theme.color.ink,
  },
  button: {
    backgroundColor: theme.color.ink,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(2),
    alignItems: 'center',
    marginTop: theme.space(1),
  },
  buttonOff: { opacity: 0.4 },
  buttonText: { color: theme.color.surface, fontSize: theme.size.body, fontWeight: '700' },
  switch: { textAlign: 'center', marginTop: theme.space(1.5), color: theme.color.inkMuted },
  error: { color: theme.color.danger },
})
