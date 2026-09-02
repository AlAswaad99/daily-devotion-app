import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { theme } from '../lib/theme'

/**
 * A ring of ticks that fills as the session runs.
 *
 * Ticks rather than a swept arc, because a true arc needs SVG and this needs to work
 * without adding a native dependency for one shape. Sixty of them read as a clock
 * face, which is the right association for a bounded prayer session, and a tick
 * either being lit or not is unambiguous at a glance in a way a thin arc is not.
 */
export function ProgressRing({
  progress,
  size = 260,
  ticks = 60,
  children,
}: {
  /** 0 to 1. */
  progress: number
  size?: number
  ticks?: number
  children?: React.ReactNode
}) {
  const clamped = Math.min(Math.max(progress, 0), 1)
  const lit = Math.round(clamped * ticks)
  const radius = size / 2

  const marks = useMemo(
    () =>
      Array.from({ length: ticks }, (_, i) => {
        // Start at the top and run clockwise, the way a clock is read.
        const angle = (i / ticks) * 2 * Math.PI - Math.PI / 2
        return {
          i,
          left: radius + Math.cos(angle) * (radius - 10) - 1.5,
          top: radius + Math.sin(angle) * (radius - 10) - 5,
          rotate: `${(i / ticks) * 360}deg`,
        }
      }),
    [ticks, radius],
  )

  return (
    <View style={[styles.ring, { width: size, height: size }]}>
      {marks.map((m) => (
        <View
          key={m.i}
          style={[
            styles.tick,
            {
              left: m.left,
              top: m.top,
              transform: [{ rotate: m.rotate }],
              backgroundColor: m.i < lit ? theme.color.accent : theme.color.line,
            },
          ]}
        />
      ))}
      <View style={styles.centre}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', justifyContent: 'center' },
  tick: { position: 'absolute', width: 3, height: 10, borderRadius: 2 },
  centre: { alignItems: 'center', justifyContent: 'center' },
})
