import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { theme } from '../../lib/theme'

const THUMB = 26
const TRACK_HEIGHT = 6

/**
 * A drag-anywhere-on-the-track slider, hand-rolled because the design has no native
 * slider to lean on.
 *
 * The thumb tracks the finger's absolute position within the track rather than a
 * delta from where the drag started, so a tap partway along the track jumps straight
 * there instead of requiring a member to first find the thumb.
 */
export function FontSlider({
  value,
  onChange,
  min = 0.9,
  max = 1.6,
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  max?: number
}) {
  const [width, setWidth] = useState(0)
  const travel = Math.max(width - THUMB, 1)
  const x = useSharedValue(Math.max(0, ((value - min) / (max - min)) * travel))

  const pan = Gesture.Pan()
    .minDistance(0)
    .activeOffsetX([-1, 1])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      const next = Math.min(Math.max(e.x - THUMB / 2, 0), travel)
      x.value = next
      const fraction = travel > 0 ? next / travel : 0
      runOnJS(onChange)(Math.round((min + fraction * (max - min)) * 100) / 100)
    })

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }))
  const fillStyle = useAnimatedStyle(() => ({
    width: x.value + THUMB / 2,
  }))

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.track}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width
          setWidth(w)
          const t = Math.max(w - THUMB, 1)
          x.value = Math.max(0, ((value - min) / (max - min)) * t)
        }}
      >
        <View style={styles.trackLine} />
        <Animated.View style={[styles.fill, fillStyle]} />
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </View>
    </GestureDetector>
  )
}

/** The two "A" endpoints framing the track — a label, not a tappable control. */
export function FontSliderScale({ label }: { label: 'small' | 'large' }) {
  return (
    <Text style={[styles.scaleGlyph, label === 'large' && styles.scaleGlyphLarge]}>A</Text>
  )
}

const styles = StyleSheet.create({
  track: {
    height: THUMB,
    justifyContent: 'center',
  },
  trackLine: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: theme.color.track,
  },
  fill: {
    position: 'absolute',
    left: THUMB / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    backgroundColor: theme.color.accent,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: theme.color.surface,
    borderWidth: 2,
    borderColor: theme.color.accent,
    ...theme.shadow.card,
  },
  scaleGlyph: {
    fontSize: 13,
    color: theme.color.inkFaint,
    includeFontPadding: false,
  },
  scaleGlyphLarge: { fontSize: 20, color: theme.color.inkSecondary },
})
