import { useEffect } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Icon, type IconName } from './Icon'
import { useNavVisibility } from '../lib/nav-visibility'
import { useProfile } from '../lib/profile'
import { fonts, theme } from '../lib/theme'

/**
 * The bar that floats over every tab.
 *
 * React Navigation's default bar is a white strip with a hairline; the design's is a
 * near-black sheet with rounded top corners, a blur behind it, and a lime gradient chip
 * under whichever tab is active. It is also the one piece of chrome on every screen, so
 * it was the single largest visual difference in the audit.
 *
 * It hides by sliding down 130px rather than unmounting — the design's transition, and
 * the only way the Bible reader can bring it back on an upward scroll without the
 * content jumping as the bar's space is reclaimed. Screens clear it with
 * `theme.layout.navClearance` instead.
 */

const TABS: Record<string, IconName> = {
  index: 'today',
  devotions: 'devotions',
  bible: 'bible',
  focus: 'focus',
  reflect: 'reflect',
}

export function FloatingNav({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const { hidden } = useNavVisibility()
  const { language } = useProfile()
  const reduced = useReducedMotion()
  const shift = useSharedValue(0)

  useEffect(() => {
    const to = hidden ? 130 : 0
    shift.value = reduced
      ? to
      : withTiming(to, { duration: 500, easing: Easing.bezier(0.4, 0, 0.2, 1) })
  }, [hidden, reduced, shift])

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: shift.value }],
    opacity: 1 - shift.value / 130,
  }))

  return (
    <Animated.View
      style={[styles.bar, { paddingBottom: 16 + insets.bottom }, theme.shadow.nav, animated]}
      pointerEvents={hidden ? 'none' : 'auto'}
    >
      {/*
        * Blur under a translucent fill, matching the design's `backdrop-filter:blur(16px)`.
        * The fill is painted on top rather than as the blur's own tint so the colour is
        * the same on both platforms — `BlurView`'s tint is interpreted differently on
        * each, and this bar sits over four very different backgrounds.
        */}
      <BlurView intensity={Platform.OS === 'ios' ? 40 : 24} tint="dark" style={styles.blur} />
      <View style={styles.fill} />
      <View style={styles.ring} pointerEvents="none" />

      <View style={styles.items}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key]!
          const active = state.index === index
          const icon = TABS[route.name] ?? 'today'
          const label = typeof options.title === 'string' ? options.title : route.name

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              style={styles.item}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                })
                if (!active && !event.defaultPrevented) navigation.navigate(route.name)
              }}
            >
              <View style={[styles.chip, active && theme.shadow.cta]}>
                {active && (
                  <LinearGradient
                    colors={['#D9E8A8', '#8FB052', '#5E7E33']}
                    locations={[0, 0.6, 1]}
                    start={{ x: 0.1, y: 0 }}
                    end={{ x: 0.9, y: 1 }}
                    style={styles.chipFill}
                  />
                )}
                <Icon
                  name={icon}
                  size={22}
                  colour={active ? theme.color.onInk : theme.color.navIdle}
                />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { fontFamily: fonts(language).label },
                  { color: active ? theme.color.onInk : theme.color.navIdle },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // minHeight, not height: on a device with a tall bottom inset (home indicator,
    // gesture bar), `paddingBottom` below eats into a fixed height until the icon
    // row no longer fits and gets clipped against `overflow: 'hidden'` — this lets
    // the bar grow instead.
    minHeight: theme.layout.navHeight,
    paddingHorizontal: 12,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  blur: { ...StyleSheet.absoluteFillObject },
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,15,4,.86)' },
  ring: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.07)',
  },

  items: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  item: { width: 64, alignItems: 'center', gap: 4 },
  chip: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipFill: { ...StyleSheet.absoluteFillObject },
  label: { fontSize: 10, letterSpacing: 0.5 },
})
