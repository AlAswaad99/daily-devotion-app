import { useEffect } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat,
  withSequence, withTiming, type SharedValue,
} from 'react-native-reanimated'
import type { StreakState } from '../lib/v3-logic'
import { theme } from '../lib/theme'

/**
 * The streak flame.
 *
 * Three rounded squares rotated 45°, largest to smallest, exactly as the design draws
 * it — a shape with one square corner and three round ones reads as a flame in a way
 * a teardrop does not. It replaces the 🔥 emoji, which rendered as a different picture
 * on every device and could not be recoloured for the fading and extinguished states.
 *
 * The two outer layers flicker out of phase (`flick1` 1.4s, `flick2` 1.1s). When the
 * streak has gone out they stop, the palette turns to ash, and three puffs of smoke
 * rise instead.
 */

const PALETTE: Record<
  StreakState,
  {
    scale: number
    outer: readonly [string, string, string]
    mid: string
    core: string
    glow: { colour: string; opacity: number; radius: number }
    flick: boolean
    smoke: boolean
  }
> = {
  strong: {
    scale: 1,
    outer: ['#F6BC45', '#E8843C', '#C05A16'],
    mid: '#F6BC45',
    core: '#FBE8B8',
    glow: { colour: '#F6BC45', opacity: 0.65, radius: 26 },
    flick: true,
    smoke: false,
  },
  low: {
    scale: 0.58,
    outer: ['#C99450', '#A5642A', '#7c4514'],
    mid: '#C99450',
    core: '#E4CFA0',
    glow: { colour: '#C99450', opacity: 0.4, radius: 12 },
    flick: true,
    smoke: false,
  },
  out: {
    scale: 0.82,
    outer: ['#454f3e', '#3d463a', '#333c2d'],
    mid: '#333c2d',
    core: '#252d20',
    glow: { colour: '#000000', opacity: 0, radius: 0 },
    flick: false,
    smoke: true,
  },
}

/** The design's hero flame is 120×126; the Today button's is 40×44. */
export function Flame({
  state,
  size = 120,
  style,
}: {
  state: StreakState
  size?: number
  style?: StyleProp<ViewStyle>
}) {
  const palette = PALETTE[state]
  const reduced = useReducedMotion()
  const alive = palette.flick && !reduced

  const outer = useSharedValue(0)
  const inner = useSharedValue(0)
  const smoke = useSharedValue(0)

  useEffect(() => {
    const loop = (ms: number) =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      )
    if (!alive) {
      outer.value = 0
      inner.value = 0
    } else {
      outer.value = loop(1400)
      inner.value = loop(1100)
    }
    smoke.value =
      palette.smoke && !reduced
        ? withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.quad) }), -1)
        : 0
  }, [alive, palette.smoke, reduced, outer, inner, smoke])

  /* `flick1`: scale(1) ↔ scale(1.07, .93), about the rotated square's own centre. */
  const outerStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: '45deg' },
      { scaleX: 1 + 0.07 * outer.value },
      { scaleY: 1 - 0.07 * outer.value },
    ],
  }))
  /* `flick2` runs the other way, which is what stops the two reading as one shape. */
  const innerStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: '45deg' },
      { scaleX: 0.95 + 0.1 * inner.value },
      { scaleY: 1.06 - 0.11 * inner.value },
    ],
  }))

  const k = size / 120
  const shadow =
    palette.glow.opacity > 0
      ? {
          shadowColor: palette.glow.colour,
          shadowOpacity: palette.glow.opacity,
          shadowRadius: palette.glow.radius * k,
          shadowOffset: { width: 0, height: 0 },
          elevation: state === 'strong' ? 10 : 4,
        }
      : null

  return (
    <View
      style={[{ width: size, height: size * 1.05, transform: [{ scale: palette.scale }] }, style]}
      pointerEvents="none"
    >
      {palette.smoke && <Smoke progress={smoke} k={k} />}

      <View style={[styles.stack, shadow]}>
        <Animated.View
          style={[
            styles.layer,
            { width: 94 * k, height: 94 * k, borderRadius: 47 * k, bottom: 6 * k, marginLeft: -47 * k },
            styles.corner,
            outerStyle,
          ]}
        >
          <LinearGradient
            colors={palette.outer as unknown as [string, string, string]}
            locations={[0, 0.55, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.layer,
            {
              width: 60 * k, height: 60 * k, borderRadius: 30 * k, bottom: 9 * k,
              marginLeft: -30 * k, backgroundColor: palette.mid,
            },
            styles.corner,
            innerStyle,
          ]}
        />

        <View
          style={[
            styles.layer,
            {
              width: 32 * k, height: 32 * k, borderRadius: 16 * k, bottom: 11 * k,
              marginLeft: -16 * k, backgroundColor: palette.core,
              transform: [{ rotate: '45deg' }],
            },
            styles.corner,
          ]}
        />
      </View>
    </View>
  )
}

/** Three puffs on staggered delays, rising and fading — `smokeRise`. */
function Smoke({ progress, k }: { progress: SharedValue<number>; k: number }) {
  return (
    <View style={styles.smoke} pointerEvents="none">
      <Puff progress={progress} k={k} delay={0} size={10} left="42%" colour="#77826b" />
      <Puff progress={progress} k={k} delay={0.33} size={7} left="52%" colour="#5e6954" />
      <Puff progress={progress} k={k} delay={0.66} size={5} left="48%" colour="#4c5643" />
    </View>
  )
}

function Puff({
  progress,
  k,
  delay,
  size,
  left,
  colour,
}: {
  progress: SharedValue<number>
  k: number
  delay: number
  size: number
  left: string
  colour: string
}) {
  const animated = useAnimatedStyle(() => {
    const t = (progress.value + delay) % 1
    return {
      /* Fades in over the first quarter, then out across the rest of the rise. */
      opacity: t < 0.25 ? (t / 0.25) * 0.5 : 0.5 * (1 - (t - 0.25) / 0.75),
      transform: [{ translateY: -52 * k * t }, { scale: 0.6 + 0.8 * t }],
    }
  })

  return (
    <Animated.View
      style={[
        styles.puff,
        {
          width: size * k,
          height: size * k,
          borderRadius: (size / 2) * k,
          backgroundColor: colour,
          left: left as `${number}%`,
        },
        animated,
      ]}
    />
  )
}

/**
 * The small flame that opens the streak screen from Today.
 *
 * Same artwork at a third of the size, with the state carried by a wash rather than by
 * a palette — at 40px the three layers are barely separable, so a fading streak reads
 * better as a dimmer flame than as a differently coloured one.
 */
export function FlameButton({ state }: { state: StreakState }) {
  const dim = state === 'low' ? 0.7 : state === 'out' ? 0.5 : 1
  return (
    <View style={{ opacity: dim }}>
      <Flame state={state} size={40} />
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  layer: { position: 'absolute', left: '50%', overflow: 'hidden' },
  /* Square at the top-left, round elsewhere: the flame's tip once it is rotated 45°. */
  corner: { borderTopLeftRadius: 0 },
  smoke: { ...StyleSheet.absoluteFillObject, bottom: '80%' },
  puff: { position: 'absolute', bottom: 0 },
})
