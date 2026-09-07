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

/**
 * Slow drifting pieces behind the celebration.
 *
 * Not falling confetti — these rise and settle, which is a quieter gesture and the one
 * the design draws. Positions, sizes, shapes and timings are the design's five, fixed
 * rather than random so the screen looks the same each time it is opened; a celebration
 * that reshuffles itself on every render reads as noise rather than as a thing that was
 * designed.
 *
 * Nothing here is announced. It carries no information, and a screen reader working
 * through decorative dots on the way to "Well done" would be the opposite of a reward.
 */

/** x and y as fractions of the screen, then the design's own size, colour and timing. */
const PIECES = [
  { x: 0.14, y: 0.15, size: 10, delay: 0, colour: '#F6BC45', square: false, spin: 0, ms: 3200 },
  { x: 0.8, y: 0.12, size: 7, delay: 600, colour: '#A9C86A', square: false, spin: 0, ms: 4000 },
  { x: 0.88, y: 0.27, size: 12, delay: 300, colour: '#D9E8A8', square: true, spin: 20, ms: 3600 },
  { x: 0.09, y: 0.32, size: 8, delay: 1000, colour: '#E8843C', square: true, spin: -15, ms: 4400 },
  { x: 0.75, y: 0.41, size: 6, delay: 1400, colour: '#F6BC45', square: false, spin: 0, ms: 3000 },
] as const

export function Confetti() {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {PIECES.map((piece, i) => (
        <Piece key={i} {...piece} />
      ))}
    </View>
  )
}

function Piece({
  x,
  y,
  size,
  delay,
  colour,
  square,
  spin,
  ms,
}: {
  x: number
  y: number
  size: number
  delay: number
  colour: string
  square: boolean
  spin: number
  ms: number
}) {
  const drift = useSharedValue(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    cancelAnimation(drift)
    if (reduced) {
      /* Held mid-drift, so the pieces are still visible — just still. */
      drift.value = 0.5
      return
    }
    drift.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    )
  }, [delay, ms, reduced, drift])

  /* `floatY`: up ten pixels and back, holding whatever tilt the piece was given. */
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 * drift.value }, { rotate: `${spin}deg` }],
  }))

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          width: size,
          height: size,
          borderRadius: square ? 3 : size / 2,
          backgroundColor: colour,
        },
        animated,
      ]}
    />
  )
}

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
})
