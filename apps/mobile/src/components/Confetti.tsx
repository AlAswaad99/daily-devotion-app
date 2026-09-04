import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { theme } from '../lib/theme'

/**
 * Slow drifting dots behind the celebration.
 *
 * Not falling confetti — these rise and fade, which is a quieter gesture and the one
 * the design draws. Positions are fixed rather than random so the screen looks the
 * same each time it is opened; a celebration that reshuffles itself on every render
 * reads as noise rather than as a thing that was designed.
 *
 * Nothing here is announced. It carries no information, and a screen reader working
 * through twelve decorative dots on the way to "Well done" would be the opposite of
 * a reward.
 */

/** x as a fraction of width, y as a fraction of height, size, and a start delay. */
const DOTS = [
  { x: 0.08, y: 0.22, size: 7, delay: 0, amber: true },
  { x: 0.19, y: 0.62, size: 5, delay: 900, amber: false },
  { x: 0.27, y: 0.12, size: 4, delay: 1800, amber: false },
  { x: 0.36, y: 0.78, size: 6, delay: 400, amber: true },
  { x: 0.47, y: 0.3, size: 4, delay: 2400, amber: false },
  { x: 0.58, y: 0.68, size: 7, delay: 1300, amber: true },
  { x: 0.66, y: 0.18, size: 5, delay: 600, amber: false },
  { x: 0.74, y: 0.52, size: 4, delay: 2000, amber: true },
  { x: 0.83, y: 0.28, size: 6, delay: 1100, amber: false },
  { x: 0.91, y: 0.72, size: 5, delay: 300, amber: true },
  { x: 0.14, y: 0.86, size: 4, delay: 1600, amber: false },
  { x: 0.52, y: 0.9, size: 5, delay: 2200, amber: true },
] as const

export function Confetti() {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {DOTS.map((dot, i) => (
        <Dot key={i} {...dot} />
      ))}
    </View>
  )
}

function Dot({
  x,
  y,
  size,
  delay,
  amber,
}: {
  x: number
  y: number
  size: number
  delay: number
  amber: boolean
}) {
  const drift = useSharedValue(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    cancelAnimation(drift)
    if (reduced) {
      /* Held mid-drift, so the dots are still visible — just still. */
      drift.value = 0.5
      return
    }
    drift.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 3800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    )
  }, [delay, reduced, drift])

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: -18 * drift.value }],
    opacity: 0.25 + 0.45 * drift.value,
  }))

  return (
    <Animated.View
      style={[
        styles.dot,
        {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: amber ? theme.color.flame : theme.color.accentBright,
        },
        animated,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  dot: { position: 'absolute' },
})
