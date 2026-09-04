import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatEthiopic, matchesQuery } from '@abide/domain'
import { PaperBackdrop } from '../../src/components/Backdrop'
import { listReflections, type ReflectionEntry } from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { lineHeightFor, translate } from '../../src/lib/i18n'
import { fonts, theme } from '../../src/lib/theme'

/**
 * Everything the user has written, newest first.
 *
 * Private: no sharing and no export in v1, and nothing here ever reaches an admin —
 * the reflections table has no admin policy at all, which is a database guarantee
 * rather than a promise this screen makes. There is deliberately no share affordance
 * anywhere on it, because drawing one would misrepresent that.
 *
 * The filters narrow by the devotion's own date rather than by when the reflection was
 * typed. Those differ whenever someone writes on an old day, and filtering by the
 * hidden one would show a card dated last spring under "last month" — the date on the
 * card and the date the filter uses have to be the same date.
 */

/** Months back, or null for everything. */
const RANGES = [
  { key: 'rangeAll', months: null },
  { key: 'rangeMonth', months: 1 },
  { key: 'range3', months: 3 },
  { key: 'range6', months: 6 },
  { key: 'rangeYear', months: 12 },
] as const

export default function Reflect() {
  const { language } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [entries, setEntries] = useState<ReflectionEntry[]>([])
  const [search, setSearch] = useState('')
  const [series, setSeries] = useState<string | null>(null)
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('rangeAll')
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const rows = await listReflections()
        if (!cancelled) {
          setEntries(rows)
          setLoading(false)
        }
      })()
      return () => {
        cancelled = true
      }
    }, []),
  )

  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) =>
    translate(key, language, vars)
  const f = fonts(language)

  /* Only series that actually have something written in them. */
  const seriesChips = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of entries) {
      if (!seen.has(e.book_id)) {
        seen.set(e.book_id, language === 'am' ? e.book_title_am : e.book_title_en)
      }
    }
    return [...seen.entries()].map(([id, title]) => ({ id, title }))
  }, [entries, language])

  const results = useMemo(() => {
    const months = RANGES.find((r) => r.key === range)?.months ?? null
    let cutoff: string | null = null
    if (months !== null) {
      const d = new Date()
      d.setMonth(d.getMonth() - months)
      cutoff = d.toISOString().slice(0, 10)
    }
    return entries.filter((e) => {
      if (series !== null && e.book_id !== series) return false
      if (cutoff !== null && e.scheduled_date < cutoff) return false
      // Searching your own writing has the same Ethiopic folding problem as the
      // library, and the same fix.
      return matchesQuery(`${e.body} ${e.topic_en} ${e.topic_am}`, search)
    })
  }, [entries, search, series, range])

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperBackdrop />
        <ActivityIndicator color={theme.color.accent} />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <FlatList
        data={results}
        keyExtractor={(e) => `${e.devotion_day_id}:${e.question_ordinal}`}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + theme.space(2) }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.kicker, { fontFamily: f.label }]}>{t('journalKicker')}</Text>
            <View style={styles.titleRow}>
              <Text
                accessibilityRole="header"
                style={[styles.title, { fontFamily: f.title }]}
              >
                {t('reflectionsTitle')}
              </Text>
              <Text style={[styles.count, { fontFamily: f.body }]}>
                {entries.length === 1
                  ? t('reflectionCountOne')
                  : t('reflectionCount', { count: entries.length })}
              </Text>
            </View>

            {entries.length > 0 && (
              <>
                <TextInput
                  style={[styles.search, { fontFamily: f.body }]}
                  placeholder={t('searchReflections')}
                  placeholderTextColor={theme.color.inkMuted}
                  value={search}
                  onChangeText={setSearch}
                />

                {seriesChips.length > 1 && (
                  <ChipRow>
                    <Chip
                      label={t('allSeries')}
                      on={series === null}
                      language={language}
                      onPress={() => setSeries(null)}
                    />
                    {seriesChips.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.title}
                        on={series === s.id}
                        language={language}
                        onPress={() => setSeries(s.id)}
                      />
                    ))}
                  </ChipRow>
                )}

                <ChipRow>
                  {RANGES.map((r) => (
                    <Chip
                      key={r.key}
                      label={t(r.key)}
                      on={range === r.key}
                      language={language}
                      onPress={() => setRange(r.key)}
                    />
                  ))}
                </ChipRow>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { fontFamily: f.body }]}>
            {entries.length === 0 ? t('noReflectionsYet') : t('noResults')}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            style={styles.card}
            onPress={() => router.push(`/day/${item.devotion_day_id}`)}
          >
            <View style={styles.cardHead}>
              <View style={styles.dateTag}>
                <Text style={[styles.dateTagText, { fontFamily: f.label }]}>
                  {formatEthiopic(item.scheduled_date, language)}
                </Text>
              </View>
              <Text style={[styles.cardSeries, { fontFamily: f.body }]} numberOfLines={1}>
                {language === 'am' ? item.book_title_am : item.book_title_en}
              </Text>
            </View>

            <Text style={[styles.cardTitle, { fontFamily: f.subtitle }]} numberOfLines={2}>
              {language === 'am' ? item.topic_am : item.topic_en}
            </Text>
            <Text
              style={[
                styles.body,
                { fontFamily: f.body, lineHeight: lineHeightFor(language, 15) },
              ]}
              numberOfLines={3}
            >
              {item.body}
            </Text>
          </Pressable>
        )}
      />
    </View>
  )
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  )
}

function Chip({
  label,
  on,
  language,
  onPress,
}: {
  label: string
  on: boolean
  language: 'en' | 'am'
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
    >
      <Text
        style={[styles.chipText, { fontFamily: fonts(language).body }, on && styles.chipTextOn]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  list: {
    paddingHorizontal: theme.layout.screenPadding,
    paddingBottom: theme.layout.navClearance,
    gap: theme.space(1.5),
  },
  header: { gap: theme.space(1.5), marginBottom: theme.space(0.5) },
  kicker: {
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.kicker,
  },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space(1.5) },
  title: { flex: 1, fontSize: 36, color: theme.color.ink },
  count: { fontSize: 12.5, color: theme.color.inkMuted },

  search: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingHorizontal: theme.space(2),
    paddingVertical: theme.space(1.5),
    fontSize: 15,
    color: theme.color.ink,
  },

  /* Negative margin so the row can scroll edge to edge inside a padded list. */
  chipRow: {
    gap: 8,
    paddingHorizontal: theme.layout.screenPadding,
    marginHorizontal: -theme.layout.screenPadding,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    maxWidth: 200,
  },
  chipOn: { backgroundColor: theme.color.inkDeep, borderColor: theme.color.inkDeep },
  chipText: { fontSize: 13, color: theme.color.inkSecondary },
  chipTextOn: { color: theme.color.onInk },

  empty: {
    textAlign: 'center',
    color: theme.color.inkMuted,
    marginTop: theme.space(6),
    paddingHorizontal: theme.space(3),
  },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2),
    gap: theme.space(0.75),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1) },
  /* Amber, so the date reads as a tag rather than as more meta text. */
  dateTag: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.tagBg,
  },
  dateTagText: { fontSize: 10.5, letterSpacing: 0.3, color: theme.color.tagInk },
  cardSeries: { flex: 1, fontSize: 12, color: theme.color.inkMuted },
  cardTitle: { fontSize: 21, lineHeight: 25, color: theme.color.ink },
  body: { fontSize: 15, color: theme.color.inkBodySoft },
})
