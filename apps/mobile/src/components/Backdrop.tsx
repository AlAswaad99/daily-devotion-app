import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, type ViewStyle } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
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
 * The ink surfaces are genuine radial gradients, drawn with SVG. The first attempt
 * faked them with a vertical gradient plus a translucent ellipse for the light, and on
 * device that ellipse announced itself as a hard arc across the screen — a solid shape
 * has an edge where a falloff does not. Now that the mascot has brought
 * react-native-svg in, the real thing costs no more than the imitation did.
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
  /* The design puts the light a fifth of the way down on Welcome, at the top on Streak. */
  const lightY = variant === 'streak' ? '0%' : '20%'

  return (
    <Svg style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Defs>
        <RadialGradient id="ink" cx="50%" cy={lightY} rx="120%" ry="70%">
          <Stop offset="0" stopColor={stops[0]} />
          <Stop offset="0.55" stopColor={stops[1]} />
          <Stop offset="1" stopColor={stops[2]} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#ink)" />
    </Svg>
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
 * Vertical. The design's 160deg is measured from north and is only 20 degrees off
 * straight down, which on a button seven times wider than it is tall is a difference
 * nobody can see. Expressing the lean as start/end points is a trap: those are
 * fractions of the box, so even a small span across x becomes a near-horizontal sweep
 * at this aspect ratio, and on device it read as a left-to-right wipe.
 */
export function CtaGradient({ style }: { style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={[theme.gradient.cta[0], theme.gradient.cta[1], theme.gradient.cta[2]]}
      locations={[0, 0.72, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
    />
  )
}

