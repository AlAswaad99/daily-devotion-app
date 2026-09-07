import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Redirect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Language } from '@abide/domain'
import { InkBackdrop } from '../src/components/Backdrop'
import { PrimaryButton } from '../src/components/PrimaryButton'
import { Mascot } from '../src/components/Mascot'
import { useSession } from '../src/lib/session'
import { translate, lineHeightFor } from '../src/lib/i18n'
import { LANGUAGE_KEY } from '../src/lib/language'
import { fonts, theme } from '../src/lib/theme'
import { useAudit } from '../src/lib/audit'

/**
 * The signed-out landing, and the first thing a new member sees.
 *
 * It collects nothing. The only decision available here is the language, and it is
 * offered because every screen after this one is written in it — asking after the join
 * code would mean showing someone a form in a language they may not read.
 *
 * There is no "I don't have a code" path, though the design drew one. The join code is
 * what resolves a member to a church and a ministry, and every row the app writes
 * carries a `church_id` under RLS; an account without one cannot save a reflection, a
 * favourite or a completion. A door with nothing behind it is worse than no door.
 */
export default function Welcome() {
  const { session } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [language, setLanguage] = useState<Language>('am')
  const audit = useAudit()

  useEffect(() => {
    void AsyncStorage.getItem(LANGUAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'am') setLanguage(stored)
    })
  }, [])

  // Already signed in: the tab gate decides between onboarding and the app.
  if (session && !audit.noRedirect) return <Redirect href="/" />

  const chooseLanguage = (next: Language) => {
    setLanguage(next)
    void AsyncStorage.setItem(LANGUAGE_KEY, next)
  }

  const t = (key: Parameters<typeof translate>[0]) => translate(key, language)
  const f = fonts(language)

  return (
    <View style={styles.screen}>
      <InkBackdrop variant="welcome" />

      <View style={[styles.langPill, { top: insets.top + 10 }]}>
        {(['en', 'am'] as const).map((code, index) => (
          <View key={code} style={styles.langItem}>
            {index === 1 && <View style={styles.langDivider} />}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: language === code }}
              accessibilityLabel={code === 'en' ? 'English' : 'አማርኛ'}
              hitSlop={8}
              onPress={() => chooseLanguage(code)}
            >
              <Text
                style={[
                  styles.langText,
                  { fontFamily: fonts(code).label },
                  language === code ? styles.langActive : styles.langIdle,
                ]}
              >
                {code === 'en' ? 'EN' : 'አማ'}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.hero}>
        <Mascot mood="idle" size={110} style={styles.mascot} />
        {/*
          * The wordmark is the brand, not a string: it reads "Abide" in both languages,
          * which is why it is not routed through `translate`.
          */}
        <Text style={[styles.wordmark, { fontFamily: f.title }]} accessibilityRole="header">
          Abide
        </Text>
        <Text
          style={[
            styles.tagline,
            { fontFamily: f.italic, lineHeight: lineHeightFor(language, 17) },
          ]}
        >
          {t('welcomeTagline')}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space(3) }]}>
        <PrimaryButton
          language={language}
          label={t('getStarted')}
          onPress={() => router.push('/sign-in')}
        />
        <View style={styles.linkSpacer} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.inkDarkest },

  langPill: {
    position: 'absolute',
    right: theme.layout.screenPadding,
    zIndex: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(12,16,5,.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.18)',
  },
  langItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  langDivider: { width: 1, height: 11, backgroundColor: 'rgba(255,255,255,.28)' },
  langText: { fontSize: 11, letterSpacing: 1 },
  langActive: { color: theme.color.accentBright },
  langIdle: { color: theme.color.onInkDim },

  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  mascot: { marginBottom: 34 },
  wordmark: {
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -1,
    color: theme.color.onInk,
    textAlign: 'center',
  },
  tagline: {
    marginTop: 12,
    fontSize: 17,
    maxWidth: 260,
    color: theme.color.onInkSecondary,
    textAlign: 'center',
  },

  /* The design's link row sat under the button; its space is kept so the CTA lands where it does. */
  footer: { paddingHorizontal: 26, gap: 6 },
  linkSpacer: { height: 43 },
  cta: {
    height: theme.layout.ctaHeight,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    ...theme.shadow.cta,
  },
  ctaPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  ctaFill: { borderRadius: theme.radius.md },
  ctaText: { fontSize: 15, letterSpacing: 0.4, color: theme.color.inkDeep },
  ctaArrow: { fontSize: 16, color: theme.color.inkDeep },
})
