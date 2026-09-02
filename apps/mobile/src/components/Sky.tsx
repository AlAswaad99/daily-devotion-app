import { StyleSheet, View, type ViewStyle } from 'react-native'
import { theme } from '../lib/theme'

/**
 * The time-of-day sky behind Today.
 *
 * It reads the *device clock*, not the member's chosen part of day. Those are
 * different things: `profile.part_of_day` is when someone intends to read and drives
 * their reminder, while this is what time it actually is when they open the app. A
 * member who prefers mornings but opens the app at eleven at night should not be shown
 * a sunrise.
 *
 * Drawn as stepped translucent bands rather than with a gradient library. It is one
 * colour fading out; a native dependency for that would be a poor trade, and this
 * renders identically on both platforms with nothing to configure.
 *
 * Stepped, not two stacked solids — that was the first attempt and it produced a hard
 * horizontal line across the screen, which read as a coloured header block rather than
 * as sky. Two opaque views cannot make a gradient between them.
 */

export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night'

/** Ethiopian daylight runs close to twelve hours year-round, so fixed bands hold. */
export function skyPhaseFor(date = new Date()): SkyPhase {
  const hour = date.getHours()
  if (hour >= 5 && hour < 9) return 'dawn'
  if (hour >= 9 && hour < 17) return 'day'
  if (hour >= 17 && hour < 20) return 'dusk'
  return 'night'
}

/*
 * Two colours per phase, top and bottom. Kept close in value: this sits behind text
 * that has to stay readable, so it is a wash rather than a picture.
 */
const PALETTE: Record<SkyPhase, string> = {
  dawn: '#f2d8bf',
  day: '#e4ecf1',
  dusk: '#eed2c0',
  night: '#d2d6e0',
}

/*
 * Enough steps that the banding is below the eye's threshold at this height, few
 * enough that it is a handful of views. Opacity falls on a curve rather than
 * linearly, so the colour lingers at the top and disappears well before the edge —
 * which is what stops it looking like a block with a soft bottom.
 */
const STEPS = 16
const BAND_HEIGHT = 22

export function Sky({ phase, style }: { phase?: SkyPhase; style?: ViewStyle }) {
  const current = phase ?? skyPhaseFor()
  const colour = PALETTE[current]

  /*
   * A phase boundary crossed while the app is open takes effect on the next render
   * of this screen. There was a cross-fade here; it animated a value that the stepped
   * bands do not read, so it was doing nothing but looking deliberate. The wash is
   * low-contrast enough that the change is barely perceptible anyway.
   */

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.sky, style]}
    >
      {Array.from({ length: STEPS }, (_, i) => (
        <View
          key={i}
          style={{
            height: BAND_HEIGHT,
            backgroundColor: colour,
            opacity: Math.pow(1 - i / STEPS, 2),
          }}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', top: 0, left: 0, right: 0 },
})
