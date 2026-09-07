import { useEffect } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated'
import type { Language } from '@abide/domain'
import { CtaGradient } from './Backdrop'
import { fonts, theme } from '../lib/theme'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * The lime button every primary action in v3 shares.
 *
 * 52px tall, radius 18, the same gradient, ink text at 800, and a trailing arrow that
 * most but not all of them carry. It replaces the ink pill the pre-v3 screens used, so
 * a member never sees two different "the main thing to do here" buttons.
 *
 * **The glow is a shadow, not a halo.** `ctaGlow` in the design pulses `box-shadow`
 * between two soft lime casts. The equivalent that exists on both platforms is the
 * shadow itself: `shadowOpacity`/`shadowRadius` carry it on iOS and `elevation` on
 * Android. A scaled translucent view behind the button would have given a hard-edged
 * ring on Android, which is worse than a shallower pulse.
 */
export function PrimaryButton({
  label,
  language,
  onPress,
  enabled = true,
  busy = false,
  arrow = true,
  glow = true,
  style,
}: {
  label: string
  language: Language
  onPress: () => void
  enabled?: boolean
  busy?: boolean
  arrow?: boolean
  /** Off where the design gives a button no `ctaGlow`: Continue, Finish series. */
  glow?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const pulse = useSharedValue(0)
  const held = useSharedValue(0)
  const reduced = useReducedMotion()
  const f = fonts(language)
  const live = enabled && !busy

  useEffect(() => {
    if (!glow || !enabled || reduced) {
      pulse.value = 0
      return
    }
    /* 3.4s, ease-in-out, mirrored — the design's keyframes are 0 → 50% → 100%. */
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    )
  }, [glow, enabled, reduced, pulse])

  /*
   * The press feedback rides a shared value rather than Pressable's `({ pressed }) =>`
   * style function.
   *
   * Reanimated drops a function style on an animated component when none of the
   * resolved entries is an animated style — which is exactly the disabled case, and it
   * left the button with no height, no fill and a left-aligned label. A static array
   * always applies, and the press now runs on the UI thread like everything else here.
   */
  const animated = useAnimatedStyle(() => ({
    shadowOpacity: enabled ? 0.45 + 0.3 * pulse.value : 0,
    shadowRadius: 12 + 6 * pulse.value,
    elevation: enabled ? 4 + 6 * pulse.value : 0,
    opacity: 1 - 0.08 * held.value,
    transform: [{ scale: 1 - 0.015 * held.value }],
  }))

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !live }}
      disabled={!live}
      onPress={onPress}
      onPressIn={() => {
        held.value = withTiming(1, { duration: 90 })
      }}
      onPressOut={() => {
        held.value = withTiming(0, { duration: 160 })
      }}
      style={[
        styles.button,
        enabled ? styles.shadowBase : styles.off,
        animated,
        style,
      ]}
    >
      {enabled && <CtaGradient style={styles.fill} />}
      {busy ? (
        <ActivityIndicator color={theme.color.inkDeep} />
      ) : (
        <>
          <Text
            style={[
              styles.label,
              { fontFamily: f.labelStrong },
              !enabled && styles.labelOff,
            ]}
          >
            {label}
          </Text>
          {arrow && (
            <Text
              style={[styles.arrow, { fontFamily: f.labelStrong }, !enabled && styles.labelOff]}
            >
              →
            </Text>
          )}
        </>
      )}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  button: {
    height: theme.layout.ctaHeight,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  /* Flat and quiet until the step is satisfied — not a lime button at low opacity. */
  off: { backgroundColor: theme.color.ctaOff },
  shadowBase: {
    shadowColor: theme.color.accent,
    shadowOffset: { width: 0, height: 8 },
  },
  fill: { borderRadius: theme.radius.md },
  label: { fontSize: 15, letterSpacing: 0.4, color: theme.color.inkDeep },
  labelOff: { color: theme.color.inkFaint },
  arrow: { fontSize: 16, color: theme.color.inkDeep },
})
