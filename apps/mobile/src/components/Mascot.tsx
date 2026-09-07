import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
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
  RadialGradient,
  Stop,
} from 'react-native-svg'
import { theme } from '../lib/theme'
import { useAudit } from '../lib/audit'

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
 *
 * Three nested layers, as in the design: an idle float on the outside, a move in the
 * middle, and a press squish on the inside. They compose rather than interrupting each
 * other, so a tap mid-float does not snap the character back to centre first.
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

/* ---------------------------------------------------------------- moves ---- */

export type MoveKey =
  | 'hop' | 'double' | 'swerve' | 'twirl' | 'jelly' | 'tilt' | 'wink' | 'stretch' | 'step'

/**
 * One keyframe. Every field is absolute rather than additive, exactly as the CSS is —
 * a frame that omits `rot` in the design resets it to zero, and does so here too.
 */
interface Frame {
  /** 0–1 through the animation, from the keyframe's percentage. */
  at: number
  tx?: number
  ty?: number
  sx?: number
  sy?: number
  /** Degrees, in the plane. */
  rot?: number
  /** Degrees about the vertical axis — the twirl. */
  ry?: number
}

/**
 * The nine moves, transcribed from the `@keyframes` blocks in the design's `<helmet>`.
 *
 * `mTwirl` is the one deliberate departure: its CSS declares `0%,100%` together, so the
 * final 8% would spin a full turn backwards to get from 360° to 0°. That reads as a
 * glitch rather than as a flourish, so the rotation is held at 360 to the end.
 */
const MOVES: Record<MoveKey, { ms: number; iter: number; frames: Frame[] }> = {
  hop: {
    ms: 1200,
    iter: 1,
    frames: [
      { at: 0, ty: 0, sx: 1, sy: 1 },
      { at: 0.15, ty: 6, sx: 1.08, sy: 0.88 },
      { at: 0.35, ty: -34, sx: 0.94, sy: 1.1 },
      { at: 0.55, ty: 0, sx: 1.1, sy: 0.86 },
      { at: 0.7, ty: -8, sx: 0.98, sy: 1.03 },
      { at: 0.85, ty: 0, sx: 1.03, sy: 0.97 },
      { at: 1, ty: 0, sx: 1, sy: 1 },
    ],
  },
  double: {
    ms: 1600,
    iter: 1,
    frames: [
      { at: 0, ty: 0, sx: 1, sy: 1 },
      { at: 0.12, ty: -12, sx: 1, sy: 1 },
      { at: 0.24, ty: 0, sx: 1.05, sy: 0.92 },
      { at: 0.36, ty: -14, sx: 1, sy: 1 },
      { at: 0.48, ty: 0, sx: 1.06, sy: 0.9 },
      { at: 0.58, ty: 4, sx: 1.1, sy: 0.84 },
      { at: 0.75, ty: -38, sx: 0.92, sy: 1.12 },
      { at: 0.92, ty: 0, sx: 1.08, sy: 0.9 },
      { at: 1, ty: 0, sx: 1, sy: 1 },
    ],
  },
  swerve: {
    ms: 2000,
    iter: 1,
    frames: [
      { at: 0, tx: 0, rot: 0 },
      { at: 0.2, tx: -16, rot: -8 },
      { at: 0.45, tx: 14, rot: 8 },
      { at: 0.7, tx: -10, rot: -5 },
      { at: 1, tx: 0, rot: 0 },
    ],
  },
  twirl: {
    ms: 2200,
    iter: 1,
    frames: [
      { at: 0, ry: 0, ty: 0, sx: 1, sy: 1 },
      { at: 0.14, ry: 180, ty: -12, sx: 1, sy: 1 },
      { at: 0.3, ry: 360, ty: 0, sx: 1, sy: 1 },
      { at: 0.42, ry: 360, ty: 4, sx: 1.07, sy: 0.9 },
      { at: 0.56, ry: 360, ty: -24, sx: 0.96, sy: 1.06 },
      { at: 0.68, ry: 360, ty: 0, sx: 1.08, sy: 0.9 },
      { at: 0.8, ry: 360, ty: -12, sx: 1, sy: 1 },
      { at: 0.92, ry: 360, ty: 0, sx: 1.03, sy: 0.97 },
      { at: 1, ry: 360, ty: 0, sx: 1, sy: 1 },
    ],
  },
  jelly: {
    ms: 1400,
    iter: 1,
    frames: [
      { at: 0, sx: 1, sy: 1 },
      { at: 0.18, sx: 1.14, sy: 0.86 },
      { at: 0.36, sx: 0.88, sy: 1.12 },
      { at: 0.54, sx: 1.08, sy: 0.92 },
      { at: 0.72, sx: 0.96, sy: 1.04 },
      { at: 1, sx: 1, sy: 1 },
    ],
  },
  tilt: {
    ms: 2000,
    iter: 1,
    frames: [
      { at: 0, rot: 0 },
      { at: 0.25, rot: 10 },
      { at: 0.6, rot: 10 },
      { at: 0.8, rot: -3 },
      { at: 1, rot: 0 },
    ],
  },
  wink: {
    ms: 1300,
    iter: 1,
    frames: [
      { at: 0, ty: 0, rot: 0 },
      { at: 0.25, ty: -10, rot: -4 },
      { at: 0.45, ty: 0, rot: 0 },
      { at: 0.6, ty: -6, rot: 3 },
      { at: 0.8, ty: 0, rot: 0 },
      { at: 1, ty: 0, rot: 0 },
    ],
  },
  stretch: {
    ms: 2200,
    iter: 1,
    frames: [
      { at: 0, sx: 1, sy: 1, ty: 0 },
      { at: 0.25, sx: 0.92, sy: 1.14, ty: -10 },
      { at: 0.55, sx: 0.92, sy: 1.14, ty: -10 },
      { at: 0.7, sx: 1.1, sy: 0.86, ty: 2 },
      { at: 0.85, sx: 0.97, sy: 1.04, ty: 0 },
      { at: 1, sx: 1, sy: 1, ty: 0 },
    ],
  },
  step: {
    ms: 2400,
    iter: 2,
    frames: [
      { at: 0, tx: 0, ty: 0, rot: 0 },
      { at: 0.1, tx: -12, ty: -9, rot: -4 },
      { at: 0.2, tx: -22, ty: 0, rot: 0 },
      { at: 0.3, tx: -30, ty: -9, rot: -4 },
      { at: 0.4, tx: -36, ty: 0, rot: 0 },
      { at: 0.55, tx: -12, ty: -9, rot: 4 },
      { at: 0.65, tx: 6, ty: 0, rot: 0 },
      { at: 0.75, tx: 20, ty: -9, rot: 4 },
      { at: 0.85, tx: 28, ty: 0, rot: 0 },
      { at: 0.95, tx: 8, ty: -6, rot: 0 },
      { at: 1, tx: 0, ty: 0, rot: 0 },
    ],
  },
}

const MOVE_KEYS = Object.keys(MOVES) as MoveKey[]

const REST: Required<Frame> = { at: 0, tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, ry: 0 }

/**
 * One keyframe track as a Reanimated sequence.
 *
 * CSS applies its timing function between each pair of keyframes rather than across the
 * whole animation, which is why this eases every segment rather than the sequence.
 */
function track(
  frames: Frame[],
  key: 'tx' | 'ty' | 'sx' | 'sy' | 'rot' | 'ry',
  ms: number,
  iterations: number,
) {
  const steps = frames.slice(1).map((frame, i) => {
    const previous = frames[i]!
    const value = frame[key] ?? REST[key]
    return withTiming(value, {
      duration: (frame.at - previous.at) * ms,
      easing: Easing.inOut(Easing.quad),
    })
  })
  const first = frames[0]![key] ?? REST[key]
  /* Snap to the opening frame, then play; repeated moves replay from the top. */
  const once = withSequence(withTiming(first, { duration: 0 }), ...steps)
  return iterations > 1 ? withRepeat(once, iterations) : once
}

/* --------------------------------------------------------------- mascot ---- */

export function Mascot({
  mood = 'idle',
  size = DEFAULT_W,
  lantern = false,
  playful = false,
  style,
}: {
  mood?: Mood
  /** Width in points. Height follows the design's 150:222 ratio. */
  size?: number
  /** The reminder-arrival signal: a lit lantern held out to the right. */
  lantern?: boolean
  /**
   * Whether idle moves fire on their own and taps play one.
   *
   * Only Today sets this. The design's own rule is the same: the character performs
   * where it lives, and stands still where it is a decoration (Welcome, the
   * notification preview, the celebration, which has a loop of its own).
   */
  playful?: boolean
  style?: StyleProp<ViewStyle>
}) {
  /* Idle layer. */
  const bob = useSharedValue(0)
  const lean = useSharedValue(0)
  const swell = useSharedValue(1)
  const lid = useSharedValue(1)

  /* Move layer. */
  const mx = useSharedValue(0)
  const my = useSharedValue(0)
  const msx = useSharedValue(1)
  const msy = useSharedValue(1)
  const mrot = useSharedValue(0)
  const mry = useSharedValue(0)
  const winkLid = useSharedValue(0)

  /* Press layer. */
  const press = useSharedValue(0)

  const [move, setMove] = useState<MoveKey | null>(null)
  const lastMove = useRef<MoveKey | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /*
   * Respect the system setting.
   *
   * "Reduce motion" is not a preference about whimsy — for some people looping
   * movement causes nausea, and a devotional app is the last place to insist on it.
   * The mascot still appears and still changes with mood; it simply holds still.
   */
  const reduced = useReducedMotion()

  /*
   * Audit mode (dev only): hold still for 800ms after mount, then start and flash a
   * marker for one frame, so a screen recording can be sliced at known times.
   */
  const audit = useAudit()
  const [armed, setArmed] = useState(!audit.play)
  const [marker, setMarker] = useState(false)
  useEffect(() => {
    if (!audit.play) return
    const timer = setTimeout(() => {
      setArmed(true)
      setMarker(true)
      setTimeout(() => setMarker(false), 150)
      /* A named move, so a recording can be sliced against that move's own keyframes. */
      if (audit.move && audit.move in MOVES) play(audit.move as MoveKey)
    }, 800)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit.play, audit.move])

  const still = reduced || !armed

  /* -------- idle -------- */
  useEffect(() => {
    cancelAnimation(bob)
    cancelAnimation(lean)
    cancelAnimation(swell)
    cancelAnimation(lid)

    if (still) {
      bob.value = 0
      lean.value = mood === 'sad' ? 0 : -3
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

    if (mood === 'sad') {
      /*
       * `mascotSad`: a slow rock that also sinks, 5.5s. Downcast rather than droopy —
       * the streak is recoverable and the repair offer is one screen away.
       */
      lean.value = withRepeat(
        withSequence(
          withTiming(2.5, { duration: 2750, easing: Easing.inOut(Easing.sin) }),
          withTiming(-2.5, { duration: 2750, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      )
      bob.value = withRepeat(
        withSequence(
          withTiming(5, { duration: 2750, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 2750, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      )
      swell.value = withTiming(1, { duration: 400 })
      return
    }

    if (mood === 'celebrating') {
      /*
       * `mDouble` on a loop — the one place a repeating celebration is right. This
       * screen exists only to mark a finished series and is left on purpose, so the
       * loop has somewhere to stop.
       */
      lean.value = withTiming(0, { duration: 200 })
      swell.value = withTiming(1, { duration: 200 })
      bob.value = withTiming(0, { duration: 200 })
      return
    }

    /*
     * `floatY`: 0 → -10px and back over 4.5s, with a constant -3° lean. Every mood
     * that is not sad or celebrating floats; the lean is what stops it reading as a
     * lift rather than as a hover.
     */
    lean.value = withTiming(-3, { duration: 400 })
    swell.value = withTiming(mood === 'pleased' ? 1 : 1, { duration: 300 })
    bob.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2250, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2250, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    )
  }, [mood, still, bob, lean, swell, lid])

  /* -------- moves -------- */
  const play = useCallback(
    (key: MoveKey) => {
      const spec = MOVES[key]
      lastMove.current = key
      setMove(key)

      mx.value = track(spec.frames, 'tx', spec.ms, spec.iter)
      my.value = track(spec.frames, 'ty', spec.ms, spec.iter)
      msx.value = track(spec.frames, 'sx', spec.ms, spec.iter)
      msy.value = track(spec.frames, 'sy', spec.ms, spec.iter)
      mrot.value = track(spec.frames, 'rot', spec.ms, spec.iter)
      mry.value = track(spec.frames, 'ry', spec.ms, spec.iter)

      if (key === 'wink') {
        /* `mWinkLid`: shut from 35% to 65%, open either side. */
        winkLid.value = withSequence(
          withTiming(0, { duration: spec.ms * 0.2 }),
          withTiming(1, { duration: spec.ms * 0.15, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: spec.ms * 0.3 }),
          withTiming(0, { duration: spec.ms * 0.15, easing: Easing.in(Easing.quad) }),
        )
      }

      if (endTimer.current) clearTimeout(endTimer.current)
      endTimer.current = setTimeout(() => setMove(null), spec.ms * spec.iter + 150)
    },
    [mx, my, msx, msy, mrot, mry, winkLid],
  )

  /*
   * The celebration hops for as long as it is on screen.
   *
   * `mDouble` is one of the nine moves, so this is the same keyframes on an endless
   * repeat rather than a second animation that happens to look similar. It is the one
   * place a looping celebration is right: the screen exists only to mark a finished
   * series and is left on purpose, so the loop has somewhere to stop.
   */
  useEffect(() => {
    if (mood !== 'celebrating' || still) return
    const spec = MOVES.double
    const loop = (key: 'tx' | 'ty' | 'sx' | 'sy' | 'rot' | 'ry') =>
      withRepeat(track(spec.frames, key, spec.ms, 1), -1)
    mx.value = loop('tx')
    my.value = loop('ty')
    msx.value = loop('sx')
    msy.value = loop('sy')
    mrot.value = loop('rot')
    mry.value = loop('ry')
    return () => {
      cancelAnimation(mx)
      cancelAnimation(my)
      cancelAnimation(msx)
      cancelAnimation(msy)
    }
  }, [mood, still, mx, my, msx, msy, mrot, mry])

  /* A tap mid-move is ignored: the current one plays through, as in the design. */
  const tap = useCallback(() => {
    if (move || still || !playful) return
    const pool = MOVE_KEYS.filter((key) => key !== lastMove.current)
    play(pool[Math.floor(Math.random() * pool.length)]!)
  }, [move, still, playful, play])

  /* Idle moves every 10–20s, and only where the character is at home and cheerful. */
  useEffect(() => {
    if (!playful || still || mood === 'sad' || mood === 'celebrating') return
    const schedule = () => {
      idleTimer.current = setTimeout(
        () => {
          if (!move) play(MOVE_KEYS[Math.floor(Math.random() * MOVE_KEYS.length)]!)
          schedule()
        },
        10_000 + Math.random() * 10_000,
      )
    }
    schedule()
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
    // `move` is read inside the timer rather than depended on: re-arming the schedule
    // on every move would restart the clock and starve the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playful, still, mood, play])

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
      if (endTimer.current) clearTimeout(endTimer.current)
    },
    [],
  )

  const idleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }, { rotate: `${lean.value}deg` }, { scale: swell.value }],
  }))

  /*
   * The twirl is a horizontal squeeze, not a `rotateY`.
   *
   * Android does not apply a Y-rotation to a view whose content is an SVG canvas — the
   * character kept its full width right through the spin, which is the one thing the
   * move is for. For flat art the projection of a turn about the vertical axis *is*
   * `scaleX = cos θ`: it narrows to nothing edge-on and comes back mirrored through the
   * far side. That is what the eye reads as a spin, and it composes with the move's own
   * scale rather than replacing it.
   */
  const moveStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: mx.value },
      { translateY: my.value },
      { rotate: `${mrot.value}deg` },
      { scaleX: msx.value * Math.cos((mry.value * Math.PI) / 180) },
      { scaleY: msy.value },
    ],
  }))

  /* `scale(1.06,.9)` with an overshoot on release — the design's press feel. */
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: 1 + 0.06 * press.value }, { scaleY: 1 - 0.1 * press.value }],
  }))

  const height = (size * ART_H) / ART_W
  const spring = { duration: 160, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }

  return (
    /*
     * Hidden from assistive technology. It carries no information a member needs —
     * the mood restates the streak and the completion state, both of which are
     * already spoken elsewhere on this screen — so announcing it would be one more
     * thing to swipe past on the way to the devotion.
     */
    <View
      style={[{ width: size, height }, styles.slot, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents={playful ? 'auto' : 'none'}
      onStartShouldSetResponder={playful ? () => true : undefined}
      onResponderGrant={
        playful
          ? () => {
              press.value = withTiming(1, spring)
            }
          : undefined
      }
      onResponderRelease={
        playful
          ? () => {
              press.value = withTiming(0, spring)
              tap()
            }
          : undefined
      }
      onResponderTerminate={
        playful
          ? () => {
              press.value = withTiming(0, spring)
            }
          : undefined
      }
    >
      <View style={styles.layer}>
        <Animated.View style={[styles.layer, idleStyle]}>
          <Animated.View style={[styles.layer, moveStyle]}>
            <Animated.View style={[styles.layer, pressStyle]}>
              <Face
                mood={mood}
                width={size}
                height={height}
                lid={lid}
                winkLid={winkLid}
                lantern={lantern}
              />
            </Animated.View>
          </Animated.View>
        </Animated.View>
      </View>
      {marker && <View style={styles.marker} />}
    </View>
  )
}

function Face({
  mood,
  width,
  height,
  lid,
  winkLid,
  lantern,
}: {
  mood: Mood
  width: number
  height: number
  lid: SharedValue<number>
  winkLid: SharedValue<number>
  lantern: boolean
}) {
  /* The pupil squashes vertically about its own centre, which is what a blink looks like. */
  const pupilProps = useAnimatedProps(() => ({ ry: 8 * lid.value }))
  /* The wink lid drops from the top of the eye rather than closing about its middle. */
  const winkProps = useAnimatedProps(() => ({
    ry: 18.5 * winkLid.value,
    cy: 63 + 18.5 * winkLid.value,
  }))

  return (
    <View style={{ width, height }}>
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
          <LinearGradient id="lanternArm" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#8E2A18" />
            <Stop offset="1" stopColor="#C6452A" />
          </LinearGradient>
          <RadialGradient id="lanternGlass" cx="0.5" cy="0.58" r="0.75">
            <Stop offset="0" stopColor="#FBE8B8" />
            <Stop offset="0.38" stopColor="#F6BC45" />
            <Stop offset="0.78" stopColor="#E8843C" />
            <Stop offset="1" stopColor="#C05A16" />
          </RadialGradient>
          <RadialGradient id="cast" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#000000" stopOpacity="0.4" />
            <Stop offset="0.6" stopColor="#000000" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {/*
          * The cast shadow, as a soft ellipse under the character.
          *
          * The design uses `drop-shadow(0 18px 18px rgba(0,0,0,.4))`, which follows the
          * silhouette. React Native has no such filter, and a view shadow would trace
          * the bounding box rather than the ribbon — a rectangle behind a shape with a
          * notch cut out of it. A grounded ellipse is the vector equivalent and is what
          * the eye reads as weight anyway.
          */}
        <Ellipse cx="75" cy="206" rx="72" ry="26" fill="url(#cast)" />

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

        {/* The wink lid, in the body's own colour so it reads as the face closing. */}
        <AnimatedEllipse cx="101.5" rx="16.5" animatedProps={winkProps} fill="#b23a22" />

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

      {lantern && <Lantern scale={width / ART_W} />}
    </View>
  )
}

/**
 * The reminder-arrival signal: a lit lantern, held out on the character's right.
 *
 * Drawn as views rather than inside the SVG because its glow is a shadow, and a shadow
 * on an SVG element is not a thing React Native offers. The geometry is the design's,
 * scaled with the character.
 */
function Lantern({ scale }: { scale: number }) {
  const flick = useSharedValue(0)
  const enter = useSharedValue(0)
  const reduced = useReducedMotion()

  useEffect(() => {
    enter.value = reduced ? 1 : withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) })
    flick.value = reduced
      ? 0
      : withRepeat(
          withSequence(
            withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
        )
  }, [reduced, enter, flick])

  const wrap = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: 14 * (1 - enter.value) }],
  }))

  /* `lanternFlick`: opacity 1 → .82 and a slight squash, 1.3s. */
  const glass = useAnimatedStyle(() => ({
    opacity: 1 - 0.18 * flick.value,
    transform: [{ scaleX: 1 + 0.06 * flick.value }, { scaleY: 1 - 0.05 * flick.value }],
  }))

  const s = (n: number) => n * scale

  return (
    <Animated.View
      style={[
        styles.lantern,
        { right: -s(30), bottom: s(48), width: s(36), height: s(62) },
        wrap,
      ]}
      pointerEvents="none"
    >
      {/* The arm reaching out of the body. */}
      <View
        style={[
          styles.lanternArm,
          { left: -s(16), top: s(28), width: s(24), height: s(9), borderRadius: s(5) },
        ]}
      />
      {/* Handle, cap, glass, base. */}
      <View
        style={[
          styles.lanternHandle,
          {
            left: s(12), top: 0, width: s(12), height: s(11),
            borderWidth: s(2.5), borderBottomWidth: 0,
            borderTopLeftRadius: s(7), borderTopRightRadius: s(7),
          },
        ]}
      />
      <View
        style={[
          styles.lanternMetal,
          { left: s(5), top: s(10), width: s(26), height: s(6), borderRadius: s(2) },
        ]}
      />
      <Animated.View
        style={[
          styles.lanternGlass,
          {
            left: s(7), top: s(15), width: s(22), height: s(30), borderRadius: s(5),
            shadowRadius: s(20), elevation: 12,
          },
          glass,
        ]}
      />
      <View
        style={[
          styles.lanternMetal,
          { left: s(4), top: s(45), width: s(28), height: s(6), borderRadius: s(2) },
        ]}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', justifyContent: 'center' },
  layer: { alignItems: 'center', justifyContent: 'center' },
  marker: { position: 'absolute', top: 0, left: 0, width: 16, height: 16, backgroundColor: '#000' },

  lantern: { position: 'absolute' },
  lanternArm: { position: 'absolute', backgroundColor: '#A0331F' },
  lanternHandle: { position: 'absolute', borderColor: '#4a3a1e' },
  lanternMetal: { position: 'absolute', backgroundColor: '#4a3a1e' },
  lanternGlass: {
    position: 'absolute',
    backgroundColor: '#F6BC45',
    shadowColor: '#F6BC45',
    shadowOpacity: 0.55,
    shadowOffset: { width: 0, height: 0 },
  },
})
