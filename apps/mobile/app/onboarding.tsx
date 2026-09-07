import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, TextInput } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { PART_STARTS, toSqlTime, type Language } from '@abide/domain'
import { DevotionTime } from '../src/components/onboarding/DevotionTime'
import { NotificationPreview } from '../src/components/onboarding/NotificationPreview'
import { CodeEntry, CODE_LENGTH } from '../src/components/onboarding/CodeEntry'
import { OnboardingChrome } from '../src/components/onboarding/Chrome'
import { supabase } from '../src/lib/supabase'
import { useSession } from '../src/lib/session'
import { useProfile } from '../src/lib/profile'
import { translate } from '../src/lib/i18n'
import { log } from '../src/lib/log'
import { registerForPushNotifications, setAllPreferences } from '../src/lib/notifications'
import { LANGUAGE_KEY } from '../src/lib/language'
import { fonts, theme } from '../src/lib/theme'
import { getAudit, useAudit } from '../src/lib/audit'

/**
 * Three steps: the join code, the name and devotion window, then notifications.
 *
 * One route rather than three, because the account does not exist until the last step.
 * `redeem_join_code` creates the profile in a single call and needs the code, the name
 * and the window together, so anything collected earlier has to survive until then —
 * and carrying that across three routes means either a store or three sets of params
 * for a flow that is walked once.
 *
 * The join code comes first because it is what binds the account to a church and a
 * ministry. Without it there is no tenancy and nothing can be written at all.
 * No guest browsing, by decision.
 */
export default function Onboarding() {
  const { session, signOut } = useSession()
  const { profile, refresh } = useProfile()
  const router = useRouter()
  const params = useLocalSearchParams<{ restart?: string }>()

  /* Audit mode (dev only) can open a step pre-filled; otherwise these are the defaults. */
  const audit = useAudit()
  const seed = getAudit()
  const [step, setStep] = useState<1 | 2 | 3>(seed.step ?? 1)
  const [language, setLanguage] = useState<Language>('am')
  const [joinCode, setJoinCode] = useState(seed.code ?? '')
  const [displayName, setDisplayName] = useState(seed.name ?? '')
  /* Morning at six, half an hour — the design's default, and the column's. */
  const [remStart, setRemStart] = useState(seed.remStart ?? PART_STARTS.morning)
  const [remDuration, setRemDuration] = useState(seed.remDuration ?? 30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /* Audit mode again: a second link lands on this same mounted screen, so re-seed. */
  useEffect(() => {
    if (audit.step === undefined) return
    setStep(audit.step)
    setJoinCode(audit.code ?? '')
    setDisplayName(audit.name ?? '')
    setRemStart(audit.remStart ?? PART_STARTS.morning)
    setRemDuration(audit.remDuration ?? 30)
  }, [audit])

  // Carry over the choice made on Welcome rather than asking twice.
  useEffect(() => {
    void AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'am') setLanguage(stored)
    })
  }, [])

  if (!session) return <Redirect href="/welcome" />
  /* Settings can send someone back through the flow deliberately; that is not a loop. */
  if (profile && !audit.noRedirect && params.restart !== '1') return <Redirect href="/" />

  const chooseLanguage = (next: Language) => {
    setLanguage(next)
    void AsyncStorage.setItem(LANGUAGE_KEY, next)
  }

  const t = (key: Parameters<typeof translate>[0]) => translate(key, language)

  /**
   * The only call that creates anything.
   *
   * `wantsReminders` is settled before the profile exists, so the preference rows and
   * the push token are written after it — they are keyed on a profile that has to be
   * there first. Neither is allowed to fail the signup: a member who is in but has no
   * push token can still read, and Settings can ask again.
   */
  const submit = async (wantsReminders: boolean) => {
    setBusy(true)
    setError(null)
    log.info('onboarding', 'redeeming join code', {
      code: joinCode, language, remStart, remDuration,
    })
    const result = await supabase.rpc('redeem_join_code', {
      p_code: joinCode,
      p_display_name: displayName.trim(),
      p_ui_language: language,
      p_reminder_at: toSqlTime(remStart),
      p_reminder_duration_min: remDuration,
    })
    log.result('onboarding', 'redeem_join_code', result)
    setBusy(false)
    if (result.error) {
      /*
       * 23503 on profiles_id_fkey means the signed-in account no longer exists on the
       * server. The token is still valid, so nothing else reveals it — and no amount
       * of retrying here will help. Clear the session and start over.
       */
      if (result.error.code === '23503') {
        log.info('onboarding', 'signed-in account no longer exists; clearing session')
        await signOut()
        return
      }
      /*
       * The code is only ever checked here: the client cannot read `join_codes`, by
       * RLS. So a wrong code surfaces at the end of the flow, and the error has to
       * send the member back to the step that can fix it.
       */
      setStep(1)
      setError(result.error.message)
      return
    }
    await setAllPreferences(wantsReminders).catch((cause: unknown) => {
      log.info('onboarding', 'could not write notification preferences', { cause })
    })
    if (wantsReminders) {
      /*
       * This is what raises the OS permission dialog. Declining it there leaves the
       * preferences on and no token, which is the honest state: they said yes to us
       * and no to Android, and Settings is where that gets reconciled.
       */
      await registerForPushNotifications().catch((cause: unknown) => {
        log.info('onboarding', 'could not register for push', { cause })
      })
    }

    await refresh()
    router.replace('/')
  }

  const back = () => {
    setError(null)
    if (step === 1) router.replace('/welcome')
    else setStep((step - 1) as 1 | 2)
  }

  if (step === 1) {
    return (
      <OnboardingChrome
        language={language}
        onLanguage={chooseLanguage}
        step={1}
        title={t('joinTitle')}
        body={t('joinSub')}
        ctaLabel={t('continueWord')}
        ctaEnabled={joinCode.length === CODE_LENGTH}
        onBack={back}
        onContinue={() => setStep(2)}
        error={error}
      >
        <CodeEntry value={joinCode} onChange={setJoinCode} language={language} />
      </OnboardingChrome>
    )
  }

  if (step === 2) {
    return (
      <OnboardingChrome
        language={language}
        onLanguage={chooseLanguage}
        step={2}
        title={t('nameTitle')}
        ctaLabel={t('continueWord')}
        ctaEnabled={displayName.trim().length > 0}
        onBack={back}
        onContinue={() => setStep(3)}
      >
        {/* The panel and four cards do not fit above the keyboard on a short phone. */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.stepBody}
        >
          <TextInput
            style={[styles.nameInput, { fontFamily: fonts(language).body }]}
            placeholder={t('namePlaceholder')}
            placeholderTextColor={theme.color.inkMuted}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <DevotionTime
            start={remStart}
            duration={remDuration}
            onStart={setRemStart}
            onDuration={setRemDuration}
            language={language}
          />
        </ScrollView>
      </OnboardingChrome>
    )
  }

  return (
    <OnboardingChrome
      language={language}
      onLanguage={chooseLanguage}
      step={3}
      title={t('notifTitle')}
      body={t('notifBody')}
      ctaLabel={t('allowReminders')}
      ctaEnabled
      ctaArrow={false}
      busy={busy}
      onBack={back}
      onContinue={() => void submit(true)}
      secondaryLabel={t('notNow')}
      onSecondary={() => void submit(false)}
      error={error}
    >
      <NotificationPreview
        name={displayName}
        start={remStart}
        duration={remDuration}
        language={language}
      />
    </OnboardingChrome>
  )
}

const styles = StyleSheet.create({
  stepBody: { paddingTop: theme.space(1), paddingBottom: theme.space(3) },
  nameInput: {
    marginTop: theme.space(2),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    paddingVertical: 16,
    paddingHorizontal: 18,
    fontSize: 20,
    color: theme.color.ink,
  },
})
