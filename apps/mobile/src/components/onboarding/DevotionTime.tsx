import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated'
import {
  formatDuration, formatWindow, formatEthiopicClock, MAX_DURATION, MIN_DURATION,
  normaliseMinute, PARTS_OF_DAY, PART_STARTS, partOfDayForMinute, periodWord, STEP_MINUTES,
  type Language, type MinuteOfDay, type PartOfDay,
} from '@abide/domain'
import { DayScene } from '../DayScene'
import { Icon } from '../Icon'
import { Kicker } from '../ui'
import { translate } from '../../lib/i18n'
import { fonts, theme } from '../../lib/theme'

/**
 * Choosing when to read: four skies, then a nudge.
 *
 * The selected card is **derived from the start time rather than stored**. Storing it
 * would let the two disagree — nudge the start from 11:45 to 12:15 and a stored
 * "morning" becomes a lie the interface keeps telling. Tapping a card is therefore not
 * "choose a part of day", it is "jump the start to the beginning of that part", which
 * is the only writeable thing here.
 *
 * The cards carry the real `DayScene`, not a flat gradient: they are previews of the
 * screen a member will open at that hour, and a preview that is only the sky's colours
 * is a swatch.
 */
export function DevotionTime({
  start,
  duration,
  onStart,
  onDuration,
  language,
}: {
  start: MinuteOfDay
  duration: number
  onStart: (next: MinuteOfDay) => void
  onDuration: (next: number) => void
  language: Language
}) {
  const f = fonts(language)
  const selected = partOfDayForMinute(start)

  return (
    <View>
      <Kicker language={language} style={styles.kicker}>
        {translate('devotionTimeLabel', language)}
      </Kicker>

      <View style={styles.grid}>
        {PARTS_OF_DAY.map((part) => (
          <PartCard
            key={part}
            part={part}
            selected={part === selected}
            language={language}
            /* The selected card shows the chosen time; the rest show where they start. */
            minute={part === selected ? start : PART_STARTS[part]}
            onPress={() => {
              onStart(PART_STARTS[part])
              onDuration(30)
            }}
          />
        ))}
      </View>

      <View style={styles.panel}>
        <StepperRow
          label={translate('startsAt', language)}
          value={`${formatEthiopicClock(start)} ${periodWord(partOfDayForMinute(start), language)}`}
          language={language}
          // Wraps rather than clamps: someone at 00:00 nudging back means 23:45.
          onMinus={() => onStart(normaliseMinute(start - STEP_MINUTES))}
          onPlus={() => onStart(normaliseMinute(start + STEP_MINUTES))}
        />
        <View style={styles.divider} />
        <StepperRow
          label={translate('durationLabel', language)}
          value={formatDuration(duration, language)}
          language={language}
          minusOff={duration <= MIN_DURATION}
          plusOff={duration >= MAX_DURATION}
          onMinus={() => onDuration(Math.max(MIN_DURATION, duration - STEP_MINUTES))}
          onPlus={() => onDuration(Math.min(MAX_DURATION, duration + STEP_MINUTES))}
        />

        <View style={styles.summary}>
          <Icon name="clock" size={16} colour={theme.color.accent} />
          <Text style={[styles.summaryLabel, { fontFamily: f.uiMedium }]}>
            {translate('yourDevotionTime', language)}
          </Text>
          <Text style={[styles.summaryValue, { fontFamily: f.labelStrong }]}>
            {formatWindow(start, duration, language)}
          </Text>
        </View>
      </View>
    </View>
  )
}

function PartCard({
  part,
  selected,
  language,
  minute,
  onPress,
}: {
  part: PartOfDay
  selected: boolean
  language: Language
  minute: MinuteOfDay
  onPress: () => void
}) {
  const f = fonts(language)
  const reduced = useReducedMotion()
  const progress = useSharedValue(selected ? 1 : 0)

  useEffect(() => {
    progress.value = reduced
      ? selected
        ? 1
        : 0
      : withTiming(selected ? 1 : 0, {
          duration: 200,
          /* The design's own overshoot: `.2s cubic-bezier(.34,1.56,.64,1)`. */
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
        })
  }, [selected, reduced, progress])

  const animatedSlot = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.02 * progress.value }],
  }))
  const animatedRing = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))

  return (
    /*
     * The selection ring is a separate, absolutely positioned overlay, not a border on
     * this box.
     *
     * The design's `box-shadow: 0 0 0 2.5px` sits *outside* the box and never changes
     * the box's own size in layout. A React Native border sits inside and does both:
     * it eats into the card's content, and — because the unselected ring was a
     * thinner 1px border — it made the selected card's slot measurably taller than
     * its neighbour, shifting the row underneath it by a couple of pixels depending on
     * which card was selected. The overlay is absolutely positioned, so it paints
     * around the card without ever being part of the grid's own layout math, and the
     * card's own border stays a constant 1px in both states.
     */
    <Animated.View style={[styles.cardSlot, animatedSlot]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={styles.card}
        onPress={onPress}
      >
        <DayScene part={part} animate={false} />
        {/* Without this the label sits on bright sky and stops being readable. */}
        <LinearGradient
          colors={['rgba(6,10,0,0)', 'rgba(6,10,0,.72)']}
          locations={[0.3, 1]}
          style={StyleSheet.absoluteFill}
        />

        {selected && (
          <View style={styles.tick}>
            <Text style={styles.tickMark}>✓</Text>
          </View>
        )}

        <View style={styles.cardFoot}>
          <Kicker language={language} size={10} tracking={1.6} colour={theme.color.onInk}>
            {translate(part, language).toUpperCase()}
          </Kicker>
          <Text
            numberOfLines={1}
            style={[
              styles.cardTime,
              { fontFamily: f.label },
              selected && styles.cardTimeOn,
            ]}
          >
            {formatEthiopicClock(minute)} {periodWord(part, language)}
          </Text>
        </View>
      </Pressable>

      {/*
        * The ring: a sibling of the card, not a child of it — the card clips its own
        * content to its rounded corner, and the ring has to spill 2.5px past it. Always
        * mounted so the opacity fade can run both ways; `pointerEvents="none"` keeps a
        * fading-out ring from stealing the tap meant for the card underneath it.
        */}
      <Animated.View style={[styles.ring, animatedRing]} pointerEvents="none" />
    </Animated.View>
  )
}

function StepperRow({
  label,
  value,
  language,
  minusOff,
  plusOff,
  onMinus,
  onPlus,
}: {
  label: string
  value: string
  language: Language
  minusOff?: boolean | undefined
  plusOff?: boolean | undefined
  onMinus: () => void
  onPlus: () => void
}) {
  const f = fonts(language)
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { fontFamily: f.label }]}>{label}</Text>
      <View style={styles.stepper}>
        <StepButton label="−" off={minusOff} onPress={onMinus} accessibilityLabel={`${label} −`} />
        <Text style={[styles.rowValue, { fontFamily: f.numeric }]}>{value}</Text>
        <StepButton label="+" off={plusOff} onPress={onPlus} accessibilityLabel={`${label} +`} />
      </View>
    </View>
  )
}

function StepButton({
  label,
  off,
  onPress,
  accessibilityLabel,
}: {
  label: string
  /* Explicitly `| undefined`: exactOptionalPropertyTypes distinguishes the two. */
  off?: boolean | undefined
  onPress: () => void
  accessibilityLabel: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: off === true }}
      disabled={off}
      hitSlop={6}
      style={({ pressed }) => [styles.step, pressed && !off && styles.stepPressed]}
      onPress={onPress}
    >
      <Text style={[styles.stepGlyph, off === true && styles.stepGlyphOff]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  kicker: { marginTop: 28 },

  grid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cardSlot: {
    /* Two up, with the 8px gap taken out of the pair. Border is constant in both
       states, so selecting a card never changes this box's own size. */
    width: '48.4%',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  card: {
    height: 104,
    borderRadius: theme.radius.md - 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  /* The selection ring: painted outside the card's own bounds, like the design's
     box-shadow, so it never participates in the grid's layout. */
  ring: {
    position: 'absolute',
    top: -2.5,
    left: -2.5,
    right: -2.5,
    bottom: -2.5,
    borderRadius: theme.radius.md + 2.5,
    borderWidth: 2.5,
    borderColor: theme.color.accentMid,
    ...theme.shadow.cta,
  },
  cardFoot: { paddingHorizontal: 12, paddingBottom: 9, gap: 2 },
  cardTime: {
    fontSize: 11.5,
    lineHeight: 14,
    color: 'rgba(242,243,226,.75)',
    includeFontPadding: false,
  },
  cardTimeOn: { color: theme.color.accentPale },
  tick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.color.accentMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { fontSize: 12, lineHeight: 14, color: theme.color.inkDeep, fontWeight: '800' },

  panel: {
    marginTop: 8,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.color.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
  },
  divider: { height: 1, backgroundColor: theme.color.panel },
  rowLabel: {
    fontSize: 12.5,
    lineHeight: 15,
    color: theme.color.inkSecondary,
    includeFontPadding: false,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: {
    fontSize: 15.5,
    lineHeight: 18,
    color: theme.color.ink,
    minWidth: 104,
    textAlign: 'center',
    includeFontPadding: false,
  },
  step: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.color.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: theme.color.line },
  stepGlyph: {
    fontSize: 18,
    lineHeight: 21,
    color: theme.color.inkDeep,
    includeFontPadding: false,
  },
  stepGlyphOff: { color: theme.color.stepOff },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.color.field,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    color: theme.color.kicker,
    includeFontPadding: false,
  },
  summaryValue: {
    fontSize: 13,
    lineHeight: 16,
    color: theme.color.accentDeep,
    includeFontPadding: false,
  },
})
