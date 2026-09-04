import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  type SharedValue,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg'
import { theme } from '../lib/theme'

/**
 * The mascot: a ribbon bookmark with a face, from the v3 design.
 *
 * The moves are transforms only — translate, scale, rotate — which is what lets them
 * run on Reanimated's UI thread. Nothing here animates layout, so nothing here can
 * make the rest of Today stutter while it plays.
 *
 * The character is drawn as vector rather than as views because its silhouette is a
 * rectangle with a V cut out of the bottom, and that notch has to be *transparent* —
 * the sky shows through it. React Native has no clip-path and no mask, so an opaque
 * wedge in the background colour would work on exactly one background and this one
 * appears over four different skies.
 */

export type Mood =
  /** Nothing is expected of the member right now. */
  | 'idle'
  /** Today is unread and a streak is at stake. */
  | 'waiting'
  /** Today has been read. */
  | 'pleased'
  /** The streak has gone. Not a scolding — a face that minds. */
  | 'sad'
  /** A series is finished. The only mood that loops a hop, and it earns it. */
  | 'celebrating'

/**
 * The design's own canvas. Every coordinate below is read straight off it, so the
 * character scales by changing one number rather than by re-deriving the face.
 */
const ART_W = 150
const ART_H = 222
const DEFAULT_W = 56

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse)

export function Mascot({
  mood = 'idle',
  size = DEFAULT_W,
  style,
}: {
  mood?: Mood
  /** Width in points. Height follows the design's 150:222 ratio. */
  size?: number
  style?: ViewStyle
}) {
  const bob = useSharedValue(0)
  const tilt = useSharedValue(0)
  const swell = useSharedValue(1)
  const lid = useSharedValue(1)

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
    cancelAnimation(lid)

    if (reduced) {
      bob.value = 0
      tilt.value = 0
      swell.value = 1
      lid.value = 1
      return
    }

    /*
     * The blink runs under every mood except the sad one, where the eyes stay open
     * and the face is doing enough already.
     */
    lid.value =
      mood === 'sad'
        ? 1
        : withRepeat(
            withSequence(
              withDelay(4400, withTiming(0.1, { duration: 90 })),
              withTiming(1, { duration: 110 }),
            ),
            -1,
          )

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

    if (mood === 'celebrating') {
      /*
       * Two hops, forever — the one place a repeating celebration is right.
       *
       * `pleased` deliberately hops once and settles, because it lives on Today where
       * the mascot stays on screen and a thing that keeps bouncing becomes a thing to
       * silence. This screen exists only to mark a finished series and is left on
       * purpose, so the loop has somewhere to stop.
       */
      tilt.value = withTiming(0, { duration: 200 })
      swell.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 190, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 210, easing: Easing.in(Easing.quad) }),
          withTiming(1.04, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 190, easing: Easing.in(Easing.quad) }),
          withTiming(1, { duration: 420 }),
        ),
        -1,
      )
      bob.value = withRepeat(
        withSequence(
          withTiming(-22, { duration: 190, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 210, easing: Easing.bounce }),
          withTiming(-12, { duration: 170, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 190, easing: Easing.bounce }),
          withTiming(0, { duration: 420 }),
        ),
        -1,
      )
    }

    if (mood === 'sad') {
      // A slow rock, no bob. Downcast rather than droopy: the streak is recoverable
      // and the repair offer is one screen away, so this is not a funeral.
      tilt.value = withRepeat(
        withSequence(
          withTiming(-0.04, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.04, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      )
      bob.value = withTiming(2, { duration: 600 })
      swell.value = withTiming(1, { duration: 400 })
    }
  }, [mood, reduced, bob, tilt, swell, lid])

  const animated = useAnimatedStyle(() => ({
    transform: [
      { translateY: bob.value },
      { rotate: `${tilt.value}rad` },
      { scale: swell.value },
    ],
  }))

  const height = (size * ART_H) / ART_W

  return (
    /*
     * Hidden from assistive technology. It carries no information a member needs —
     * the mood restates the streak and the completion state, both of which are
     * already spoken elsewhere on this screen — so announcing it would be one more
     * thing to swipe past on the way to the devotion.
     */
    <View
      style={[{ width: size, height }, styles.slot, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={animated}>
        <Face mood={mood} width={size} height={height} lid={lid} />
      </Animated.View>
    </View>
  )
}

function Face({
  mood,
  width,
  height,
  lid,
}: {
  mood: Mood
  width: number
  height: number
  lid: SharedValue<number>
}) {
  /* The pupil squashes vertically about its own centre, which is what a blink looks like. */
  const pupilProps = useAnimatedProps(() => ({ ry: 8 * lid.value }))

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${ART_W} ${ART_H}`}>
      <Defs>
        {/*
          * 155deg in CSS measures clockwise from north, so it runs down and slightly
          * right — not the 45-degree diagonal an untranslated x2/y2 would give.
          */}
        <LinearGradient id="body" x1="0" y1="0" x2="0.42" y2="0.91">
          <Stop offset="0" stopColor={theme.gradient.mascot[0]} />
          <Stop offset="0.4" stopColor={theme.gradient.mascot[1]} />
          <Stop offset="1" stopColor={theme.gradient.mascot[2]} />
        </LinearGradient>
        <LinearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </LinearGradient>
      </Defs>

      {/*
        * The ribbon: square shoulders rounded at 18, straight sides, and a V notched
        * up from the bottom edge to 82% of the height.
        */}
      <Path
        d={`M18,0 H132 A18,18 0 0 1 150,18 V222 L75,182 L0,222 V18 A18,18 0 0 1 18,0 Z`}
        fill="url(#body)"
      />

      {/* The light down the left side, which is what stops it reading as a flat shape. */}
      <Rect x="16" y="12" width="36" height="132" rx="18" fill="url(#sheen)" />

      {mood === 'sad' && (
        <>
          <Rect
            x="33"
            y="52"
            width="26"
            height="5"
            rx="2.5"
            fill={theme.mascotInk}
            transform="rotate(-14 46 54.5)"
          />
          <Rect
            x="88"
            y="52"
            width="26"
            height="5"
            rx="2.5"
            fill={theme.mascotInk}
            transform="rotate(14 101 54.5)"
          />
        </>
      )}

      <Ellipse cx="48.5" cy="81.5" rx="15.5" ry="17.5" fill="#ffffff" />
      <Ellipse cx="101.5" cy="81.5" rx="15.5" ry="17.5" fill="#ffffff" />
      <AnimatedEllipse cx="50" cy="82" rx="7" animatedProps={pupilProps} fill={theme.mascotInk} />
      <AnimatedEllipse cx="103" cy="82" rx="7" animatedProps={pupilProps} fill={theme.mascotInk} />

      {(mood === 'idle' || mood === 'pleased' || mood === 'celebrating') && (
        <Path
          d="M55,116 A20,20 0 0 0 95,116"
          stroke={theme.mascotInk}
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {mood === 'waiting' && (
        <Rect x="58" y="126" width="34" height="5" rx="2.5" fill={theme.mascotInk} />
      )}

      {mood === 'sad' && (
        <>
          <Path
            d="M57,142 A20,20 0 0 1 93,142"
            stroke={theme.mascotInk}
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
          />
          <Ellipse cx="51.5" cy="110.5" rx="4.5" ry="6.5" fill="#9CCBE8" />
        </>
      )}
    </Svg>
  )
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
})
