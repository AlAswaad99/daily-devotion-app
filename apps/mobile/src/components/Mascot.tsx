import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { theme } from '../lib/theme'

/**
 * The mascot, and the moves it makes.
 *
 * **The artwork does not exist yet.** What is drawn below is deliberately plain
 * geometry standing in for it. That is not a placeholder in the usual apologetic
 * sense: the spec's decision is that the moves are transform keyframes and that a
 * later Rive migration is "a later swap behind one component boundary", so the
 * boundary is the deliverable. When the character is drawn, only the `<Face/>` at the
 * bottom of this file changes — every mood, timing and easing above it survives.
 *
 * The moves are transforms only — translate, scale, rotate — which is what lets them
 * run on Reanimated's UI thread. Nothing here animates layout, so nothing here can
 * make the rest of Today stutter while it plays.
 */

export type Mood =
  /** Nothing is expected of the member right now. */
  | 'idle'
  /** Today is unread and a streak is at stake. */
  | 'waiting'
  /** Today has been read. */
  | 'pleased'

const SIZE = 56

export function Mascot({ mood = 'idle', style }: { mood?: Mood; style?: ViewStyle }) {
  const bob = useSharedValue(0)
  const tilt = useSharedValue(0)
  const swell = useSharedValue(1)

  /*
   * Respect the system setting.
   *
   * "Reduce motion" is not a preference about whimsy — for some people looping
   * movement causes nausea, and a devotional app is the last place to insist on it.
   * The mascot still appears and still changes with mood; it simply holds still.
   */
  const reduced = useReducedMotion()

  useEffect(() => {
    cancelAnimation(bob)
    cancelAnimation(tilt)
    cancelAnimation(swell)

    if (reduced) {
      bob.value = 0
      tilt.value = 0
      swell.value = 1
      return
    }

    if (mood === 'idle') {
      // Breathing. Slow enough to read as alive rather than as an animation.
      bob.value = withRepeat(
        withSequence(
          withTiming(-3, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      )
      tilt.value = withTiming(0, { duration: 400 })
      swell.value = withTiming(1, { duration: 400 })
    }

    if (mood === 'waiting') {
      // A small lean, held. Attention without nagging — it does not loop, because a
      // thing that keeps moving in the corner of the eye becomes a thing to silence.
      tilt.value = withTiming(-0.14, { duration: 700, easing: Easing.out(Easing.cubic) })
      bob.value = withRepeat(
        withSequence(
          withTiming(-5, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      )
      swell.value = withTiming(1, { duration: 400 })
    }

    if (mood === 'pleased') {
      // One hop, then settle. The reward is for having read, so it happens once and
      // stops; a celebration that repeats stops being one.
      tilt.value = withTiming(0, { duration: 300 })
      swell.value = withSequence(
        withTiming(1.12, { duration: 220, easing: Easing.out(Easing.back(2)) }),
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
      )
      bob.value = withSequence(
        withTiming(-10, { duration: 220, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 420, easing: Easing.bounce }),
      )
    }
  }, [mood, reduced, bob, tilt, swell])

  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value },
      { rotate: `${tilt.value}rad` },
      { scale: swell.value },
    ],
  }))

  return (
    /*
     * Hidden from assistive technology. It carries no information a member needs —
     * the mood restates the streak and the completion state, both of which are
     * already spoken elsewhere on this screen — so announcing it would be one more
     * thing to swipe past on the way to the devotion.
     */
    <View
      style={[styles.slot, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={animated}>
        <Face mood={mood} />
      </Animated.View>
    </View>
  )
}

/**
 * Everything below is the part that gets thrown away.
 *
 * Plain views, no art direction attempted — a drawn character or a Rive file replaces
 * this and nothing above it needs to know.
 */
function Face({ mood }: { mood: Mood }) {
  return (
    <View
      style={[
        styles.body,
        mood === 'pleased' && { backgroundColor: theme.color.accentSoft },
      ]}
    >
      <View style={styles.eyes}>
        <View style={[styles.eye, mood === 'pleased' && styles.eyeHappy]} />
        <View style={[styles.eye, mood === 'pleased' && styles.eyeHappy]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  slot: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  body: {
    width: SIZE - 8,
    height: SIZE - 8,
    borderRadius: (SIZE - 8) / 2,
    backgroundColor: theme.color.prayer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyes: { flexDirection: 'row', gap: 8 },
  eye: {
    width: 5,
    height: 8,
    borderRadius: 3,
    backgroundColor: theme.color.ink,
  },
  // Squeezed shut, the way eyes go when a face is pleased.
  eyeHappy: { height: 3, borderRadius: 2 },
})
