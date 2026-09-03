import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Language } from '@abide/domain'
import { CtaGradient, PaperBackdrop } from '../Backdrop'
import { lineHeightFor, translate } from '../../lib/i18n'
import { fonts, theme } from '../../lib/theme'

/**
 * The frame every onboarding step shares: back arrow, step counter, language pill,
 * title, body, and one primary action pinned to the bottom.
 *
 * The steps differ only in what sits between the body and the button, so the chrome
 * lives here rather than three times over. The language pill is on every step because
 * someone who picks the wrong language on Welcome should not have to finish onboarding
 * in it to change their mind.
 */
export function OnboardingChrome({
  language,
  onLanguage,
  step,
  title,
  body,
  children,
  ctaLabel,
  ctaEnabled,
  busy,
  onBack,
  onContinue,
  error,
}: {
  language: Language
  onLanguage: (next: Language) => void
  /** 1-based, for the "STEP n OF 3" counter. */
  step: 1 | 2 | 3
  title: string
  body?: string
  children?: ReactNode
  ctaLabel: string
  ctaEnabled: boolean
  busy?: boolean
  onBack: () => void
  onContinue: () => void
  error?: string | null
}) {
  const insets = useSafeAreaInsets()
  const f = fonts(language)
  const stepLabel = translate(`obStep${step}` as 'obStep1', language)

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={translate('back', language)}
          hitSlop={10}
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={[styles.stepLabel, { fontFamily: f.label }]}>{stepLabel}</Text>

        <View style={styles.langPill}>
          {(['en', 'am'] as const).map((code, index) => (
            <View key={code} style={styles.langItem}>
              {index === 1 && <View style={styles.langDivider} />}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: language === code }}
                accessibilityLabel={code === 'en' ? 'English' : 'አማርኛ'}
                hitSlop={8}
                onPress={() => onLanguage(code)}
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
      </View>

      <View style={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { fontFamily: f.title, lineHeight: 38 * 1.06 }]}
        >
          {title}
        </Text>
        {body !== undefined && (
          <Text
            style={[styles.body, { fontFamily: f.body, lineHeight: lineHeightFor(language, 16) }]}
          >
            {body}
          </Text>
        )}
        {children}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + theme.space(3) }]}>
        {error !== null && error !== undefined && (
          <Text style={[styles.error, { fontFamily: f.body }]}>{error}</Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ctaEnabled || busy === true }}
          disabled={!ctaEnabled || busy === true}
          style={({ pressed }) => [
            styles.cta,
            ctaEnabled ? theme.shadow.cta : styles.ctaOff,
            pressed && ctaEnabled && styles.ctaPressed,
          ]}
          onPress={onContinue}
        >
          {ctaEnabled && <CtaGradient style={styles.ctaFill} />}
          {busy === true ? (
            <ActivityIndicator color={theme.color.inkDeep} />
          ) : (
            <>
              <Text
                style={[
                  styles.ctaText,
                  { fontFamily: f.label },
                  !ctaEnabled && styles.ctaTextOff,
                ]}
              >
                {ctaLabel}
              </Text>
              <Text
                style={[
                  styles.ctaArrow,
                  { fontFamily: f.label },
                  !ctaEnabled && styles.ctaTextOff,
                ]}
              >
                →
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },

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
  stepLabel: {
    flex: 1,
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.kicker,
  },

  /* Solid ink here rather than the translucent pill Welcome uses: this sits on paper. */
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.inkDeep,
  },
  langItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  langDivider: { width: 1, height: 11, backgroundColor: 'rgba(255,255,255,.28)' },
  langText: { fontSize: 11, letterSpacing: 1 },
  langActive: { color: theme.color.accentBright },
  langIdle: { color: theme.color.onInkDim },

  content: { flex: 1, paddingHorizontal: theme.layout.screenPadding, paddingTop: theme.space(3) },
  title: { fontSize: 36, color: theme.color.ink },
  body: {
    marginTop: theme.space(1.5),
    fontSize: 16,
    color: theme.color.inkBodySoft,
  },

  footer: { paddingHorizontal: theme.layout.screenPadding, gap: theme.space(1.5) },
  error: { fontSize: 13, color: theme.color.danger, textAlign: 'center' },
  cta: {
    height: theme.layout.ctaHeight,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  /* Flat and quiet until the step is satisfied — not a lime button with low opacity. */
  ctaOff: { backgroundColor: '#e2e6cf' },
  ctaPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  ctaFill: { borderRadius: theme.radius.md },
  ctaText: { fontSize: 15, letterSpacing: 0.4, color: theme.color.inkDeep },
  ctaTextOff: { color: theme.color.inkFaint },
  ctaArrow: { fontSize: 16, color: theme.color.inkDeep },
})
