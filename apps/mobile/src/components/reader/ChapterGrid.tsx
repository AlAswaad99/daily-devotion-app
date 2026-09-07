import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Language } from '@abide/domain'
import { fonts, theme } from '../../lib/theme'

const COLUMNS = 6
const CELL = `${100 / COLUMNS}%`

/**
 * A number grid for picking a chapter, styled after `StreakCalendar`'s day cells —
 * the one grid-of-numbers pattern already in the app, recoloured for the sheet's
 * paper ground instead of the calendar's ink one.
 */
export function ChapterGrid({
  count,
  selected,
  onSelect,
  language,
}: {
  count: number
  selected: number
  onSelect: (chapter: number) => void
  language: Language
}) {
  const f = fonts(language)
  return (
    <View style={styles.grid}>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => {
        const on = n === selected
        return (
          <View key={n} style={styles.slot}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(n)}
              style={[styles.cell, on && styles.cellOn]}
            >
              <Text style={[styles.num, { fontFamily: f.numeric }, on && styles.numOn]}>{n}</Text>
            </Pressable>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  slot: { width: CELL, padding: 4 },
  cell: {
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.panel,
  },
  cellOn: { backgroundColor: theme.color.inkDeep },
  num: { fontSize: 14, color: theme.color.inkBody, includeFontPadding: false },
  numOn: { color: theme.color.accentBright },
})
