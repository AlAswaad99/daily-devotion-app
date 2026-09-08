import { useEffect, useState } from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text,
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
import { CodeEntry, CODE_LENGTH } from '../src/components/onboarding/CodeEntry'
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
 * Phone + OTP, not email + password: Supabase's own SMS providers don't reach
 * Ethiopian numbers affordably, so the code is delivered by a Telegram bot via
 * a Send SMS Auth Hook (see docs/telegram-bot.md). That means a phone has to
 * be *linked* to a Telegram chat before it can receive anything — `is_telegram_
 * linked` checks that ahead of asking for a code, and the 'activate' step below
 * is what happens when it says no.
 *
 * `signInWithOtp` and `verifyOtp` cover both a returning member and a brand new
 * one identically — there is no separate sign-up mode, unlike the email version
 * this replaced.
 */
type Step = 'phone' | 'activate' | 'otp'

const COUNTRY_CODE = '251'

/** Accepts `09…`, `9…` or a full `+2519…` and always returns E.164. */
function toE164(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (raw.trim().startsWith('+')) return `+${digits}`
  const local = digits.startsWith('0') ? digits.slice(1) : digits
  return `+${COUNTRY_CODE}${local}`
}

export default function SignIn() {
  const { session, loading } = useSession()
  const insets = useSafeAreaInsets()
  const audit = useAudit()
  const [step, setStep] = useState<Step>('phone')
  const [language, setLanguage] = useState<Language>('am')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
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

  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string>) =>
    translate(key, language, vars)

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

  const sendOtp = async (fullPhone: string) => {
    setBusy(true)
    setError(null)
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: fullPhone })
    log.result('sign-in', 'signInWithOtp', { error: otpError })
    setBusy(false)
    if (otpError) {
      setError(otpError.message)
      return
    }
    setStep('otp')
  }

  /** The one place that decides whether a code can be sent at all. */
  const checkActivation = async (): Promise<boolean> => {
    const fullPhone = toE164(phone)
    const { data: linked, error: linkError } = await supabase.rpc('is_telegram_linked', {
      p_phone: fullPhone,
    })
    log.result('sign-in', 'is_telegram_linked', { error: linkError, data: linked })
    if (linkError) {
      setError(linkError.message)
      return false
    }
    return Boolean(linked)
  }

  const submitPhone = async () => {
    setBusy(true)
    setError(null)
    const linked = await checkActivation()
    setBusy(false)
    if (error) return
    if (!linked) {
      setStep('activate')
      return
    }
    await sendOtp(toE164(phone))
  }

  const recheckActivation = async () => {
    setBusy(true)
    setError(null)
    const linked = await checkActivation()
    if (!linked) {
      setBusy(false)
      setError(t('stillNotActivated'))
      return
    }
    await sendOtp(toE164(phone))
  }

  const openTelegram = () => {
    const username = process.env.EXPO_PUBLIC_TELEGRAM_BOT_USERNAME
    if (!username) {
      log.info('sign-in', 'EXPO_PUBLIC_TELEGRAM_BOT_USERNAME is not set')
      return
    }
    void Linking.openURL(`https://t.me/${username}?start=verify`)
  }

  const verify = async () => {
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: toE164(phone),
      token: otp,
      type: 'sms',
    })
    log.result('sign-in', 'verifyOtp', { error: verifyError })
    setBusy(false)
    if (verifyError) {
      setError(t('invalidOtp'))
      return
    }
    // On success the session updates and the redirect above takes over: to
    // onboarding if there is no profile yet, otherwise to Today.
  }

  const languagePill = (
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
  )

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <PaperBackdrop />
      {languagePill}

      {step === 'phone' && (
        <>
          <View style={styles.body}>
            <Kicker language={language}>{t('appName')}</Kicker>
            <Title language={language} size={36} accessibilityRole="header" style={styles.title}>
              {t('signIn')}
            </Title>
            <Body language={language} colour={theme.color.inkSecondary} style={styles.subtitle}>
              {t('signInSubtitle')}
            </Body>

            <View style={styles.phoneRow}>
              <View style={styles.countryChip}>
                <Text style={[styles.countryChipText, { fontFamily: fonts(language).body }]}>
                  {`+${COUNTRY_CODE}`}
                </Text>
              </View>
              <TextInput
                style={[styles.input, styles.phoneInput, { fontFamily: fonts(language).body }]}
                placeholder={t('phoneNumber')}
                placeholderTextColor={theme.color.inkMuted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                value={phone}
                onChangeText={setPhone}
              />
            </View>

            {error !== null && (
              <Body language={language} size={14} colour={theme.color.danger} style={styles.error}>
                {error}
              </Body>
            )}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            <PrimaryButton
              language={language}
              label={t('sendCode')}
              enabled={phone.replace(/[^0-9]/g, '').length >= 9}
              busy={busy}
              arrow={false}
              onPress={() => void submitPhone()}
            />
          </View>
        </>
      )}

      {step === 'activate' && (
        <>
          <View style={styles.body}>
            <Kicker language={language}>{t('appName')}</Kicker>
            <Title language={language} size={30} accessibilityRole="header" style={styles.title}>
              {t('activateTelegramTitle')}
            </Title>
            <Body language={language} colour={theme.color.inkSecondary} style={styles.subtitle}>
              {t('activateTelegramBody')}
            </Body>

            {error !== null && (
              <Body language={language} size={14} colour={theme.color.danger} style={styles.error}>
                {error}
              </Body>
            )}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 24, gap: 10 }]}>
            <PrimaryButton
              language={language}
              label={t('openTelegram')}
              enabled
              arrow={false}
              onPress={openTelegram}
            />
            <Pressable
              accessibilityRole="button"
              style={styles.switch}
              disabled={busy}
              onPress={() => void recheckActivation()}
            >
              {busy ? (
                <ActivityIndicator />
              ) : (
                <Text style={[styles.switchText, { fontFamily: fonts(language).label }]}>
                  {t('checkAgain')}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.switch}
              onPress={() => {
                setStep('phone')
                setError(null)
              }}
            >
              <Text style={[styles.switchText, { fontFamily: fonts(language).label }]}>
                {t('changePhoneNumber')}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 'otp' && (
        <>
          <View style={styles.body}>
            <Kicker language={language}>{t('appName')}</Kicker>
            <Title language={language} size={30} accessibilityRole="header" style={styles.title}>
              {t('enterOtpTitle')}
            </Title>
            <Body language={language} colour={theme.color.inkSecondary} style={styles.subtitle}>
              {t('otpSentTo', { phone: toE164(phone) })}
            </Body>

            <CodeEntry value={otp} onChange={setOtp} language={language} numeric />

            {error !== null && (
              <Body language={language} size={14} colour={theme.color.danger} style={styles.error}>
                {error}
              </Body>
            )}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + 24, gap: 10 }]}>
            <PrimaryButton
              language={language}
              label={t('signIn')}
              enabled={otp.length === CODE_LENGTH}
              busy={busy}
              arrow={false}
              onPress={() => void verify()}
            />
            <Pressable
              accessibilityRole="button"
              style={styles.switch}
              onPress={() => void sendOtp(toE164(phone))}
            >
              <Text style={[styles.switchText, { fontFamily: fonts(language).label }]}>
                {t('resendCode')}
              </Text>
            </Pressable>
          </View>
        </>
      )}
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
  phoneRow: { flexDirection: 'row', gap: 8 },
  countryChip: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.md,
  },
  countryChipText: { fontSize: 17, color: theme.color.inkSecondary },
  phoneInput: { flex: 1 },
  error: { marginTop: 4 },

  footer: { paddingHorizontal: 24, gap: 6 },
  switch: { alignItems: 'center', paddingVertical: 13 },
  switchText: { fontSize: 13.5, color: theme.color.kicker },
})
