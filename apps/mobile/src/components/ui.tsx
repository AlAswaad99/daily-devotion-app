import { type ReactNode } from 'react'
import {
  Pressable, ScrollView, StyleSheet, Text, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native'
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated'
import { useEffect } from 'react'
import type { Language } from '@abide/domain'
import { CtaGradient } from './Backdrop'
import { lineHeightFor } from '../lib/i18n'
import { fonts, theme } from '../lib/theme'

/**
 * The type and surface primitives every v3 screen is built from.
 *
 * Before this, each screen re-declared `fontFamily`, size and colour inline, which is
 * how six screens ended up still pointing at the outgoing Noto faces while four had
 * moved to Archivo and Newsreader. A role named once cannot drift.
 *
 * Every one of them turns off Android's font padding. Left on, a `Text` measures taller
 * than its own line height by whatever the face's metrics ask for — a few points each,
 * invisible once and eight points down a settings page that stacks five labels. With it
 * off, a line box is exactly `lineHeight`, which is what the design's CSS means.
 */
const exact = { includeFontPadding: false } as const

type TextProps = {
  children: ReactNode
  language: Language
  style?: StyleProp<TextStyle>
  numberOfLines?: number
  /** Passed through for headers and anything a screen reader should announce as one. */
  accessibilityRole?: 'header' | 'text'
}

/**
 * Uppercase, letter-spaced, 9–13px. The smallest thing that ships.
 *
 * The line height is set rather than left to the face. A font's default leading differs
 * by family, so an unset kicker was a point or two taller in Archivo than the design's
 * `line-height: normal` — which does not matter once, and matters by ten points once a
 * settings page has stacked five of them.
 */
export function Kicker({
  children,
  language,
  style,
  size = theme.size.kicker,
  tracking = theme.tracking.kicker,
  colour = theme.color.kicker,
}: TextProps & { size?: number; tracking?: number; colour?: string }) {
  return (
    <Text
      style={[
        {
          ...exact,
          fontFamily: fonts(language).labelStrong,
          fontSize: size,
          /* Ethiopic needs the extra room its ascenders and descenders actually use. */
          lineHeight: Math.round(size * (language === 'am' ? 1.45 : 1.2)),
          letterSpacing: tracking,
          color: colour,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Screen titles: Newsreader 34–56 at 1.06. */
export function Title({
  children,
  language,
  style,
  size = 36,
  colour = theme.color.ink,
  numberOfLines,
  accessibilityRole,
}: TextProps & { size?: number; colour?: string }) {
  return (
    <Text
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      style={[
        {
          ...exact,
          fontFamily: fonts(language).title,
          fontSize: size,
          lineHeight: Math.round(size * 1.06),
          color: colour,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Card and row titles: Newsreader 18.5–24 at 1.1. */
export function Subtitle({
  children,
  language,
  style,
  size = 19,
  colour = theme.color.ink,
  numberOfLines,
}: TextProps & { size?: number; colour?: string }) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          ...exact,
          fontFamily: fonts(language).subtitle,
          fontSize: size,
          lineHeight: Math.round(size * 1.12),
          color: colour,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Reading text: Newsreader 15–18.5, leading per script. */
export function Body({
  children,
  language,
  style,
  size = 16,
  colour = theme.color.inkBody,
  italic = false,
  numberOfLines,
}: TextProps & { size?: number; colour?: string; italic?: boolean }) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          ...exact,
          fontFamily: italic ? fonts(language).italic : fonts(language).body,
          fontSize: size,
          lineHeight: lineHeightFor(language, size),
          color: colour,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** UI text the design sets in the label family at 600–700: rows, metas, values. */
export function UiText({
  children,
  language,
  style,
  size = 14.5,
  colour = theme.color.inkSecondary,
  strong = false,
  numberOfLines,
}: TextProps & { size?: number; colour?: string; strong?: boolean }) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          ...exact,
          fontFamily: strong ? fonts(language).label : fonts(language).uiMedium,
          fontSize: size,
          lineHeight: Math.round(size * (language === 'am' ? 1.45 : 1.2)),
          color: colour,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/** Anton, for counts, clocks and code characters. Arabic numerals in both languages. */
export function Numeral({
  children,
  language,
  style,
  size = 30,
  colour = theme.color.onInk,
}: TextProps & { size?: number; colour?: string }) {
  return (
    <Text
      style={[
        {
          ...exact,
          fontFamily: fonts(language).numeric,
          fontSize: size,
          lineHeight: Math.round(size * 1.12),
          color: colour,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/**
 * A white card on paper.
 *
 * The design draws its hairline as `0 0 0 1px #dde3c4` — a shadow ring, outside the
 * box. React Native has no such thing, so this is a real border, which sits inside and
 * costs a pixel of content width. At 366px wide with 20px padding that is invisible,
 * and the alternative is a wrapper view per card.
 */
export function PaperCard({
  children,
  style,
  radius = theme.radius.md,
  lift = 'soft',
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
  lift?: 'none' | 'soft' | 'big'
}) {
  return (
    <View
      style={[
        styles.paperCard,
        { borderRadius: radius },
        lift === 'soft' && theme.shadow.card,
        lift === 'big' && theme.shadow.cardBig,
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** The near-black card the design floats over ink surfaces: Today's devotion, summary. */
export function InkCard({
  children,
  style,
  radius = theme.radius.sheet,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
}) {
  return (
    <View style={[styles.inkCard, { borderRadius: radius }, theme.shadow.inkCard, style]}>
      {children}
    </View>
  )
}

/** A filter pill. `small` is the design's second row (range chips), which runs tighter. */
export function Chip({
  label,
  on,
  language,
  onPress,
  small = false,
  style,
}: {
  label: string
  on: boolean
  language: Language
  onPress: () => void
  small?: boolean
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, small && styles.chipSmall, on && styles.chipOn, style]}
      onPress={onPress}
    >
      <Text
        numberOfLines={1}
        style={[
          exact,
          { fontFamily: fonts(language).label, fontSize: small ? 11.5 : 12 },
          on ? styles.chipTextOn : styles.chipText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** A horizontally scrolling row of chips that can still reach the screen edges. */
export function ChipRow({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.chipRow, style]}
    >
      {children}
    </ScrollView>
  )
}

/** The lime progress bar: series, library cards, the summary. */
export function ProgressBar({
  fraction,
  height = 6,
  style,
}: {
  fraction: number
  height?: number
  style?: StyleProp<ViewStyle>
}) {
  const width = useSharedValue(fraction)
  const reduced = useReducedMotion()

  useEffect(() => {
    width.value = reduced
      ? fraction
      : withTiming(fraction, { duration: 400, easing: Easing.inOut(Easing.quad) })
  }, [fraction, reduced, width])

  const fill = useAnimatedStyle(() => ({ width: `${Math.round(width.value * 100)}%` }))

  return (
    <View style={[styles.track, { height, borderRadius: height / 1.5 }, style]}>
      <Animated.View style={[styles.fill, { borderRadius: height / 1.5 }, fill]}>
        <CtaGradient style={{ borderRadius: height / 1.5 }} />
      </Animated.View>
    </View>
  )
}

/**
 * `riseFade`: opacity 0→1 and translateY 14→0.
 *
 * The design puts this on list items and cards as they arrive. It runs once on mount
 * and is skipped entirely under "reduce motion", where a card that slides into place
 * is exactly what the setting is asking not to happen.
 */
export function RiseFade({
  children,
  duration = 350,
  delay = 0,
  style,
}: {
  children: ReactNode
  duration?: number
  delay?: number
  style?: StyleProp<ViewStyle>
}) {
  const progress = useSharedValue(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      progress.value = 1
      return
    }
    progress.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.quad),
    })
  }, [duration, delay, reduced, progress])

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: 14 * (1 - progress.value) }],
  }))

  return <Animated.View style={[animated, style]}>{children}</Animated.View>
}

/** The 38px ink circle with a lime arrow that opens every screen the design draws. */
export function BackButton({
  onPress,
  label,
  variant = 'ink',
  style,
}: {
  onPress: () => void
  label: string
  /** `translucent` is the streak screen's, which sits on an ink ground already. */
  variant?: 'ink' | 'translucent'
  style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={[styles.back, variant === 'translucent' && styles.backTranslucent, style]}
      onPress={onPress}
    >
      <Text style={styles.backArrow}>←</Text>
    </Pressable>
  )
}

/** Back arrow, kicker, and an optional trailing control, on one row. */
export function ScreenHeader({
  kicker,
  language,
  onBack,
  backLabel,
  variant = 'ink',
  trailing,
  style,
}: {
  kicker: string
  language: Language
  onBack: () => void
  backLabel: string
  variant?: 'ink' | 'translucent'
  trailing?: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.header, style]}>
      <BackButton onPress={onBack} label={backLabel} variant={variant} />
      <Kicker
        language={language}
        style={styles.headerKicker}
        colour={variant === 'translucent' ? theme.color.onInkSecondary : theme.color.kicker}
      >
        {kicker}
      </Kicker>
      {trailing}
    </View>
  )
}

const styles = StyleSheet.create({
  paperCard: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  inkCard: {
    backgroundColor: 'rgba(13,18,7,.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.07)',
  },

  chip: {
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: theme.radius.pillSoft,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    maxWidth: 220,
  },
  chipSmall: { paddingVertical: 6, paddingHorizontal: 13 },
  chipOn: { backgroundColor: theme.color.inkDeep, borderColor: theme.color.inkDeep },
  chipText: { color: theme.color.chipIdle },
  chipTextOn: { color: theme.color.accentBright },
  /* Negative margin so a padded list can still scroll its chips edge to edge. */
  chipRow: {
    gap: 8,
    paddingHorizontal: theme.layout.screenPadding,
    marginHorizontal: -theme.layout.screenPadding,
  },

  track: { backgroundColor: theme.color.track, overflow: 'hidden' },
  fill: { height: '100%', overflow: 'hidden' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    paddingHorizontal: theme.layout.screenPadding,
  },
  headerKicker: { flex: 1 },
  back: {
    width: theme.layout.backButton,
    height: theme.layout.backButton,
    borderRadius: theme.layout.backButton / 2,
    backgroundColor: theme.color.inkDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTranslucent: { backgroundColor: 'rgba(255,255,255,.08)' },
  backArrow: { fontSize: 17, lineHeight: 20, color: theme.color.accentBright },
})
