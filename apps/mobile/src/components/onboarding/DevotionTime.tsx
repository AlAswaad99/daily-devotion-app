import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  formatDuration, formatWindow, formatEthiopicClock, MAX_DURATION, MIN_DURATION,
  normaliseMinute, PARTS_OF_DAY, PART_STARTS, partOfDayForMinute, STEP_MINUTES,
  type Language, type MinuteOfDay, type PartOfDay,
} from '@abide/domain'
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
      <Text style={[styles.kicker, { fontFamily: f.label }]}>
        {translate('devotionTimeLabel', language)}
      </Text>

      <View style={styles.grid}>
        {PARTS_OF_DAY.map((part) => (
          <PartCard
            key={part}
            part={part}
            selected={part === selected}
            language={language}
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
          value={formatEthiopicClock(start)}
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
          <Text style={styles.clockGlyph}>◷</Text>
          <Text style={[styles.summaryLabel, { fontFamily: f.body }]}>
            {translate('yourDevotionTime', language)}
          </Text>
          <Text style={[styles.summaryValue, { fontFamily: f.numeric }]}>
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
  onPress,
}: {
  part: PartOfDay
  selected: boolean
  language: Language
  onPress: () => void
}) {
  const f = fonts(language)
  const sky = theme.sky[part]

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.card, selected && styles.cardOn]}
      onPress={onPress}
    >
      <LinearGradient
        colors={sky.colors as unknown as [string, string, ...string[]]}
        locations={sky.locations as unknown as [number, number, ...number[]]}
        style={StyleSheet.absoluteFill}
      />
      {/* Without this the label sits on bright sky and stops being readable. */}
      <LinearGradient
        colors={['transparent', 'rgba(6,10,0,.72)']}
        locations={[0.3, 1]}
        style={StyleSheet.absoluteFill}
      />

      {selected && (
        <View style={styles.tick}>
          <Text style={styles.tickMark}>✓</Text>
        </View>
      )}

      <View style={styles.cardFoot}>
        <Text style={[styles.cardLabel, { fontFamily: f.label }]}>
          {translate(part, language)}
        </Text>
        <Text
          style={[
            styles.cardTime,
            { fontFamily: f.body },
            selected && styles.cardTimeOn,
          ]}
        >
          {formatEthiopicClock(PART_STARTS[part])}
        </Text>
      </View>
    </Pressable>
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
      <Text style={[styles.rowLabel, { fontFamily: f.body }]}>{label}</Text>
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
  kicker: {
    marginTop: theme.space(3.5),
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.kicker,
  },

  grid: {
    marginTop: theme.space(1.5),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  card: {
    /* Two up, with the 8px gap taken out of the pair. */
    width: '48.4%',
    height: 104,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.color.line,
    justifyContent: 'flex-end',
  },
  cardOn: {
    borderWidth: 2.5,
    borderColor: theme.color.accentMid,
    ...theme.shadow.card,
  },
  cardFoot: { padding: 10 },
  cardLabel: {
    fontSize: 10,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.onInk,
    textTransform: 'uppercase',
  },
  cardTime: { marginTop: 2, fontSize: 11.5, color: 'rgba(242,243,226,.75)' },
  cardTimeOn: { color: theme.color.accentPale },
  tick: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.color.accentBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickMark: { fontSize: 12, lineHeight: 14, color: theme.color.inkDeep },

  panel: {
    marginTop: theme.space(1.5),
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
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  divider: { height: 1, backgroundColor: theme.color.line, marginHorizontal: 14 },
  rowLabel: { fontSize: 15, color: theme.color.inkBody },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowValue: { fontSize: 15.5, color: theme.color.ink, minWidth: 74, textAlign: 'center' },
  step: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.color.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { backgroundColor: theme.color.line },
  stepGlyph: { fontSize: 19, lineHeight: 22, color: theme.color.accentDeep },
  stepGlyphOff: { color: '#b3bd97' },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.color.field,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  clockGlyph: { fontSize: 15, color: theme.color.kicker },
  summaryLabel: { flex: 1, fontSize: 13, color: theme.color.inkSecondary },
  summaryValue: { fontSize: 13.5, color: theme.color.ink },
})
