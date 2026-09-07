import { useEffect } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing, useAnimatedProps, useReducedMotion, useSharedValue,
  withRepeat, withSequence, withTiming,
} from 'react-native-reanimated'
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, RadialGradient, Stop,
} from 'react-native-svg'
import type { PartOfDay } from '@abide/domain'

/**
 * The sky behind Today, and inside each devotion-time card.
 *
 * A port of `DayScene.dc.html`: one 200×250 canvas, four ground gradients, a sun and a
 * moon that travel between parts of day, clouds, stars, a horizon wash and two birds.
 * Coordinates and colours are read straight off the design so the card art and the
 * Today backdrop cannot drift apart.
 *
 * This replaces `Sky`, which faked a wash with sixteen stepped translucent bands and
 * explained that a gradient library was a poor trade for one soft fade. That was true
 * of a wash and is not true of a scene: there is a sun in it.
 *
 * `animate` is off inside the time cards. Four skies breathing at once behind a form is
 * noise, and the cards are 104px tall — the drift would be invisible anyway.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedG = Animated.createAnimatedComponent(G)

/** Per-part positions and opacities, from the design's `C` table. */
const SCENE: Record<
  PartOfDay,
  {
    sun: [number, number]
    moon: [number, number]
    sunOp: number
    moonOp: number
    star: number
    cloudOp: number
    cloud: string
    bird: number
    horizon: string
  }
> = {
  morning: {
    sun: [-26, 46], moon: [-8, 150], sunOp: 1, moonOp: 0, star: 0,
    cloudOp: 1, cloud: '#ffffff', bird: 0.8, horizon: 'rgba(255,180,120,.12)',
  },
  afternoon: {
    sun: [0, -74], moon: [-8, 150], sunOp: 1, moonOp: 0, star: 0,
    cloudOp: 1, cloud: '#ffffff', bird: 0.75, horizon: 'rgba(150,195,245,.10)',
  },
  evening: {
    sun: [28, 46], moon: [-8, 150], sunOp: 1, moonOp: 0, star: 0,
    cloudOp: 0.6, cloud: '#f3cdb0', bird: 0.2, horizon: 'rgba(255,110,55,.28)',
  },
  night: {
    sun: [0, 150], moon: [8, -72], sunOp: 0, moonOp: 1, star: 1,
    cloudOp: 0, cloud: '#cdd6ea', bird: 0, horizon: 'rgba(8,10,34,.42)',
  },
}

const GROUND: Record<PartOfDay, { colours: string[]; stops: number[] }> = {
  morning: { colours: ['#FFE9B0', '#FFBF7C', '#FF9C72'], stops: [0, 0.55, 1] },
  afternoon: { colours: ['#A8DBFF', '#6FB7F2', '#3F95E0'], stops: [0, 0.55, 1] },
  evening: { colours: ['#FFCB73', '#FB8C6A', '#B5689A', '#6E54A0'], stops: [0, 0.38, 0.72, 1] },
  night: { colours: ['#3A3E86', '#23254F', '#101230'], stops: [0, 0.5, 1] },
}

/** Fixed positions, so the sky is the same every time it is opened. */
const STARS = [
  [30, 46, 1.5], [58, 30, 1.1], [84, 54, 1.3], [46, 96, 1], [104, 38, 1.2],
  [128, 60, 1.4], [162, 42, 1.5], [182, 80, 1.1], [150, 104, 1], [24, 128, 1.2],
  [72, 120, 0.9], [112, 92, 1.1], [190, 120, 1], [14, 70, 1.2],
] as const

export function DayScene({
  part,
  animate = true,
  style,
}: {
  part: PartOfDay
  animate?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const scene = SCENE[part]
  const ground = GROUND[part]
  const reduced = useReducedMotion()
  const moving = animate && !reduced

  /* One driver per looping element; each is a 0→1 ramp the styles read off. */
  const bob = useSharedValue(0)
  const glow = useSharedValue(0)
  const drift = useSharedValue(0)

  useEffect(() => {
    if (!moving) {
      bob.value = 0
      glow.value = 0
      drift.value = 0
      return
    }
    const loop = (ms: number) =>
      withRepeat(
        withSequence(
          withTiming(1, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: ms / 2, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      )
    bob.value = loop(7000)
    glow.value = loop(6000)
    drift.value = loop(22000)
  }, [moving, bob, glow, drift])

  /*
   * Animated through SVG props rather than styles: `G` takes `translateX`/`translateY`
   * of its own, and a style transform on it is silently ignored on Android.
   */
  const bodyBob = useAnimatedProps(() => ({ translateY: -3 * bob.value }))
  const glowProps = useAnimatedProps(() => ({
    opacity: 0.28 + 0.24 * glow.value,
    r: 44 * (1 + 0.14 * glow.value),
  }))
  const moonGlowProps = useAnimatedProps(() => ({
    opacity: 0.12 + 0.1 * glow.value,
    r: 40 * (1 + 0.14 * glow.value),
  }))
  const cloudDrift = useAnimatedProps(() => ({ translateX: -6 + 17 * drift.value }))
  const cloudDrift2 = useAnimatedProps(() => ({ translateX: 9 - 16 * drift.value }))

  return (
    <View style={[styles.wrap, style]} pointerEvents="none">
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 200 250"
        preserveAspectRatio="xMidYMid slice"
      >
        <Defs>
          <LinearGradient id={`ground-${part}`} x1="0" y1="0" x2="0" y2="1">
            {ground.colours.map((colour, i) => (
              <Stop key={colour} offset={String(ground.stops[i])} stopColor={colour} />
            ))}
          </LinearGradient>
          <RadialGradient id="sun" cx="0.4" cy="0.34" r="0.8">
            <Stop offset="0" stopColor="#FFFDF2" />
            <Stop offset="0.45" stopColor="#FFDD83" />
            <Stop offset="1" stopColor="#F5A623" />
          </RadialGradient>
          <RadialGradient id="moon" cx="0.38" cy="0.34" r="0.82">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.5" stopColor="#E6EAF4" />
            <Stop offset="1" stopColor="#C0C6DA" />
          </RadialGradient>
        </Defs>

        <Rect width="200" height="250" fill={`url(#ground-${part})`} />

        {/* The high haze the design breathes at 4–13% opacity. */}
        <Ellipse cx="100" cy="14" rx="170" ry="96" fill="#ffffff" opacity={0.08} />

        {scene.star > 0 && (
          <G opacity={scene.star}>
            {STARS.map(([cx, cy, r]) => (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#ffffff" opacity={0.75} />
            ))}
            <Path
              d="M150 26 l1.5 3.6 3.6 1.5 -3.6 1.5 -1.5 3.6 -1.5 -3.6 -3.6 -1.5 3.6 -1.5z"
              fill="#ffffff"
            />
          </G>
        )}

        {scene.sunOp > 0 && (
          <G transform={`translate(${scene.sun[0]}, ${scene.sun[1]})`} opacity={scene.sunOp}>
            <AnimatedG animatedProps={bodyBob}>
              <AnimatedCircle cx="100" cy="120" fill="#FFE08A" animatedProps={glowProps} />
              <Circle cx="100" cy="120" r="30" fill="url(#sun)" />
              <Ellipse cx="91" cy="110" rx="10" ry="7" fill="#ffffff" opacity={0.4} />
            </AnimatedG>
          </G>
        )}

        {scene.moonOp > 0 && (
          <G transform={`translate(${scene.moon[0]}, ${scene.moon[1]})`} opacity={scene.moonOp}>
            <AnimatedG animatedProps={bodyBob}>
              <AnimatedCircle cx="100" cy="118" fill="#ffffff" animatedProps={moonGlowProps} />
              <Circle cx="100" cy="118" r="28" fill="url(#moon)" />
              <Circle cx="110" cy="110" r="6" fill="#cfd5e6" opacity={0.5} />
              <Circle cx="92" cy="128" r="4" fill="#cfd5e6" opacity={0.45} />
              <Circle cx="106" cy="130" r="3" fill="#cfd5e6" opacity={0.4} />
            </AnimatedG>
          </G>
        )}

        <Rect x="0" y="176" width="200" height="74" fill={scene.horizon} />

        {scene.cloudOp > 0 && (
          <G opacity={scene.cloudOp}>
            <AnimatedG animatedProps={cloudDrift}>
              <Ellipse cx="66" cy="116" rx="24" ry="12" fill={scene.cloud} />
              <Ellipse cx="92" cy="110" rx="32" ry="17" fill={scene.cloud} />
              <Ellipse cx="116" cy="118" rx="20" ry="11" fill={scene.cloud} />
            </AnimatedG>
            <AnimatedG animatedProps={cloudDrift2}>
              <Ellipse cx="84" cy="180" rx="22" ry="11" fill={scene.cloud} />
              <Ellipse cx="112" cy="186" rx="28" ry="14" fill={scene.cloud} />
              <Ellipse cx="70" cy="186" rx="16" ry="9" fill={scene.cloud} />
            </AnimatedG>
          </G>
        )}

        {scene.bird > 0 && (
          <G opacity={scene.bird} stroke="#5b4636" strokeWidth={1.4} fill="none" strokeLinecap="round">
            <Path d="M96 56 q5 -4.5 10 0 q5 -4.5 10 0" />
            <Path d="M132 42 q4 -3.5 8 0 q4 -3.5 8 0" />
          </G>
        )}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
})
