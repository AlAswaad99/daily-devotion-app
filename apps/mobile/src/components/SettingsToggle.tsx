import { Pressable, StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { theme } from '../lib/theme'

const TRACK_W = 50
const TRACK_H = 30
const KNOB = 24
const TRAVEL = TRACK_W - KNOB - 6

/**
 * The switch, drawn rather than borrowed.
 *
 * React Native's `Switch` renders the platform control, which on Android is Material
 * purple and ignores every token in the design. This is 50×30 with the lime gradient
 * the rest of the app uses for anything affirmative.
 */
export function SettingsToggle({
  value,
  onChange,
  accessibilityLabel,
}: {
  value: boolean
  onChange: (next: boolean) => void
  accessibilityLabel: string
}) {
  const reduced = useReducedMotion()
  const knob = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduced
          ? value
            ? TRAVEL
            : 0
          : withTiming(value ? TRAVEL : 0, {
              /* The design's spring: it overshoots and settles. */
              duration: 250,
              easing: Easing.bezier(0.34, 1.56, 0.64, 1),
            }),
      },
    ],
  }))

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[styles.track, !value && styles.trackOff]}
    >
      {/* The design's own switch gradient, which is not the CTA's three-stop lime. */}
      {value && (
        <LinearGradient
          colors={['#A9C86A', '#5E7E33']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={styles.fill}
        />
      )}
      <Animated.View style={[styles.knob, knob]} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  trackOff: { backgroundColor: '#d5dac4' },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: TRACK_H / 2 },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: '#ffffff',
    shadowColor: '#1f2612',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
})
