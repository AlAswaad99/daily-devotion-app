import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { theme } from '../lib/theme'

/**
 * The two surface families, as backgrounds.
 *
 * `Sky` next door fakes its wash with stepped translucent bands and explains why: for
 * one soft gradient, a native dependency was a poor trade. That reasoning does not
 * extend to v3, which is built on gradients — every primary button, both surface
 * families, the nav's active chip, the flame, the mascot. Ten hand-stepped gradients
 * would be a lot of views to carry for the same result, so `expo-linear-gradient` came
 * in. Sky is left alone: it works, and nothing is gained by rewriting it.
 *
 * The design specifies the ink surfaces as radial gradients. React Native has no radial
 * primitive, so they are a vertical gradient plus one wide, soft ellipse where the
 * design puts the light source. At phone size that is indistinguishable from the real
 * thing, and it costs two views.
 */

/** Ritual surfaces: Today, Streak, Focus, onboarding, celebration. */
export function InkBackdrop({
  variant = 'welcome',
  style,
}: {
  variant?: 'welcome' | 'streak'
  style?: ViewStyle
}) {
  const stops = variant === 'streak' ? theme.gradient.inkStreak : theme.gradient.inkWelcome
  /* The design puts the light a fifth of the way down on Welcome, at the very top on Streak. */
  const lightTop = variant === 'streak' ? '-30%' : '-14%'

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient
        colors={[stops[0], stops[1], stops[2]]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, { top: lightTop, backgroundColor: stops[0] }]} />
    </View>
  )
}

/** Reading surfaces: devotion detail, Bible, library, reflections, settings. */
export function PaperBackdrop({ style }: { style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={[theme.gradient.paper[0], theme.gradient.paper[1]]}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  )
}

/**
 * The lime fill every primary action shares.
 *
 * Angled rather than vertical: the design runs it at 160deg, which on a 52px button
 * reads as a diagonal sheen rather than a top-to-bottom fade.
 */
export function CtaGradient({ style }: { style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={[theme.gradient.cta[0], theme.gradient.cta[1], theme.gradient.cta[2]]}
      locations={[0, 0.72, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  )
}

const styles = StyleSheet.create({
  /*
   * Wider than the screen and taller than it needs to be, so the falloff leaves the
   * frame rather than ending in a visible edge.
   */
  glow: {
    position: 'absolute',
    left: '-25%',
    width: '150%',
    height: '70%',
    borderRadius: 999,
    opacity: 0.55,
  },
})
