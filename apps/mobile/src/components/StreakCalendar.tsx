import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import {
  ethiopicMonthDays, ethiopicMonthStartsOn, gregorianRange, monthName, PAGUME,
  type Language,
} from '@abide/domain'
import { translate } from '../lib/i18n'
import { fonts, theme } from '../lib/theme'

/**
 * The month grid, on the Ethiopian calendar.
 *
 * **Weekday-aligned, seven columns.** An Ethiopian month is a uniform thirty days, so
 * it is tempting to lay it out as a tidy six-by-five block with no weekday heads — and
 * the design offers that as a variant. It is not the default, and this ships the
 * aligned one, because thirty days on a seven-day week still start on an arbitrary
 * weekday: the uniformity buys a predictable number of cells, not a tidy start. Losing
 * the weekday columns would cost the one thing people actually scan a streak grid for,
 * which is whether the gaps are weekends.
 *
 * Set `GRID` to 'block' for the other variant.
 */
const GRID: 'weekday' | 'block' = 'weekday'

/** How far back the arrows go. A year of history, minus the month you are in. */
const MONTHS_BACK = 11

export type DayFace = 'counted' | 'repaired' | 'backfilled' | 'missed' | 'future' | 'preJoin'

export interface CalendarCell {
  id: string
  state: DayFace
}

/** Sunday first, matching `getUTCDay`. */
const WEEKDAY_HEADS: Record<Language, readonly string[]> = {
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  am: ['እ', 'ሰ', 'ማ', 'ረ', 'ሐ', 'ዓ', 'ቅ'],
}

/** 13 months to the year, so this linearises for comparison and arithmetic. */
const monthIndex = (year: number, month: number) => year * PAGUME + (month - 1)

export function StreakCalendar({
  month,
  onMonth,
  currentMonth,
  cells,
  today,
  language,
  onOpenDay,
}: {
  month: { year: number; month: number }
  onMonth: (next: { year: number; month: number }) => void
  /** The month `today` falls in — the forward limit. */
  currentMonth: { year: number; month: number }
  cells: Map<string, CalendarCell>
  today: string | null
  language: Language
  onOpenDay: (id: string) => void
}) {
  const f = fonts(language)
  const days = ethiopicMonthDays(month.year, month.month)

  const here = monthIndex(month.year, month.month)
  const now = monthIndex(currentMonth.year, currentMonth.month)
  const canGoBack = here > now - MONTHS_BACK
  const canGoForward = here < now

  const step = (delta: number) => {
    const next = here + delta
    onMonth({ year: Math.floor(next / PAGUME), month: (next % PAGUME) + 1 })
  }

  /*
   * Leading blanks so the first day lands under its weekday. Pagume needs them too —
   * it is short, not aligned differently.
   */
  const lead = GRID === 'weekday' ? ethiopicMonthStartsOn(month.year, month.month) : 0

  const scheduled = days.filter((d) => cells.has(d.iso))
  const done = scheduled.filter((d) => {
    const state = cells.get(d.iso)?.state
    return state === 'counted' || state === 'repaired' || state === 'backfilled'
  })

  return (
    <View>
      <View style={styles.header}>
        <NavButton
          glyph="‹"
          enabled={canGoBack}
          label={monthName(month.month, language)}
          onPress={() => step(-1)}
        />
        <View style={styles.headerLabel}>
          <Text style={[styles.monthName, { fontFamily: f.labelStrong }]}>
            {monthName(month.month, language)} {month.year}
          </Text>
          <Text style={[styles.monthRange, { fontFamily: f.uiMedium }]}>
            {gregorianRange(month.year, month.month, language)}
          </Text>
        </View>
        <NavButton
          glyph="›"
          enabled={canGoForward}
          label={monthName(month.month, language)}
          onPress={() => step(1)}
        />
      </View>

      {GRID === 'weekday' && (
        <View style={styles.heads}>
          {WEEKDAY_HEADS[language].map((head, i) => (
            <Text key={i} style={[styles.head, { fontFamily: f.labelStrong }]}>
              {head}
            </Text>
          ))}
        </View>
      )}

      <View style={[styles.grid, GRID === 'block' && styles.gridBlock]}>
        {Array.from({ length: lead }, (_, i) => (
          <View key={`lead-${i}`} style={styles.cell} />
        ))}

        {days.map((day) => {
          const entry = cells.get(day.iso)
          const state = entry?.state
          const isToday = today === day.iso
          const open = entry !== undefined && state !== 'future' && state !== 'preJoin'

          return (
            <Pressable
              key={day.iso}
              accessibilityRole="button"
              accessibilityState={{ disabled: !open }}
              disabled={!open}
              onPress={() => entry && onOpenDay(entry.id)}
              style={[styles.cell, isToday && styles.cellToday]}
            >
              <Text
                style={[
                  styles.day,
                  { fontFamily: f.labelStrong },
                  /* Read days are bright, missed ones warm, and the rest recede. */
                  { color: numberColour(state, isToday) },
                ]}
              >
                {day.ethiopicDay}
              </Text>
              <CellFace state={state} />
            </Pressable>
          )
        })}
      </View>

      <Text style={[styles.footer, { fontFamily: f.uiMedium }]}>
        {translate('calendarProgress', language, { done: done.length, total: scheduled.length })}
      </Text>
    </View>
  )
}

/**
 * The day number's colour, from the design's own four cases: today, read, missed, and
 * everything outside the member's record.
 */
function numberColour(state: DayFace | undefined, isToday: boolean): string {
  if (isToday) return theme.color.accentPale
  if (state === undefined || state === 'future' || state === 'preJoin') return theme.color.calDim
  return state === 'missed' ? theme.color.missedSoft : theme.color.calRead
}

/**
 * A smile, a frown, or nothing.
 *
 * Drawn rather than typed: a glyph would depend on whichever font happened to resolve,
 * and the two scripts here resolve to different families. The design names three
 * outcomes; the streak engine distinguishes five, so repair and backfill keep the amber
 * the rest of the app uses for a rescued streak rather than being flattened into the
 * lime of a day that was simply read.
 */
function CellFace({ state }: { state?: DayFace | undefined }) {
  if (state === undefined || state === 'future' || state === 'preJoin') {
    return <View style={styles.faceSlot} />
  }

  const smiling = state !== 'missed'
  const colour =
    state === 'counted'
      ? theme.color.accentBright
      : state === 'repaired'
        ? theme.color.flame
        : state === 'backfilled'
          ? theme.color.flamePale
          : theme.color.missed

  return (
    <View style={styles.faceSlot}>
      <Svg width={15} height={15} viewBox="0 0 15 15">
        {/* Eyes, then a mouth that curves the other way when the day was missed. */}
        <Path d="M5,5.5 L5,6.5" stroke={colour} strokeWidth="1.6" strokeLinecap="round" />
        <Path d="M10,5.5 L10,6.5" stroke={colour} strokeWidth="1.6" strokeLinecap="round" />
        <Path
          d={smiling ? 'M4.5,9 A3.6,3.6 0 0 0 10.5,9' : 'M4.5,10.5 A3.6,3.6 0 0 1 10.5,10.5'}
          stroke={colour}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </View>
  )
}

function NavButton({
  glyph,
  enabled,
  label,
  onPress,
}: {
  glyph: string
  enabled: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={8}
      style={styles.nav}
      onPress={onPress}
    >
      <Text style={[styles.navGlyph, !enabled && styles.navGlyphOff]}>{glyph}</Text>
    </Pressable>
  )
}

const CELL = `${100 / 7}%`

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.space(1.5),
  },
  headerLabel: { flex: 1, alignItems: 'center' },
  monthName: {
    fontSize: 11.5,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.onInk,
    textTransform: 'uppercase',
  },
  monthRange: { marginTop: 2, fontSize: 9.5, color: theme.color.onInkDim },

  nav: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navGlyph: { fontSize: 18, lineHeight: 21, color: theme.color.accentBright },
  navGlyphOff: { color: '#4a5640' },

  heads: { flexDirection: 'row', marginBottom: 2 },
  head: {
    width: CELL,
    textAlign: 'center',
    fontSize: 8.5,
    letterSpacing: 1,
    color: theme.color.onInkDim,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  /* Six columns instead of seven, for the unaligned variant. */
  gridBlock: { paddingHorizontal: '3.5%' },

  cell: {
    width: CELL,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    gap: 1,
  },
  cellToday: {
    backgroundColor: 'rgba(169,200,106,.16)',
    borderWidth: 1.5,
    borderColor: theme.color.accentBright,
  },
  day: { fontSize: 9.5 },
  /* Reserved whether or not a face is drawn, so rows do not jump. */
  faceSlot: { height: 15, justifyContent: 'center' },

  footer: {
    marginTop: theme.space(1.5),
    textAlign: 'center',
    fontSize: 10,
    color: theme.color.onInkMuted,
  },
})
