import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatEthiopic, matchesQuery } from '@abide/domain'
import { PaperBackdrop } from '../../src/components/Backdrop'
import { listReflections, type ReflectionEntry } from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { lineHeightFor, translate } from '../../src/lib/i18n'
import { Chip, ChipRow } from '../../src/components/ui'
import { RANGES, inRange, type RangeKey } from '../../src/lib/ranges'
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

export default function Reflect() {
  const { language, sync } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [entries, setEntries] = useState<ReflectionEntry[]>([])
  const [search, setSearch] = useState('')
  const [series, setSeries] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('rangeAll')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const reload = useCallback(async () => {
    const rows = await listReflections()
    setEntries(rows)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void reload()
    }, [reload]),
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await sync({ force: true })
    await reload()
    setRefreshing(false)
  }, [sync, reload])

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
    return entries.filter((e) => {
      if (series !== null && e.book_id !== series) return false
      if (!inRange(e.scheduled_date, range, from, to)) return false
      // Searching your own writing has the same Ethiopic folding problem as the
      // library, and the same fix.
      return matchesQuery(`${e.body} ${e.topic_en} ${e.topic_am}`, search)
    })
  }, [entries, search, series, range, from, to])

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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
        }
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
                  {RANGES.map((key) => (
                    <Chip
                      key={key}
                      small
                      label={t(key)}
                      on={range === key}
                      language={language}
                      onPress={() => setRange(key)}
                    />
                  ))}
                </ChipRow>

                {range === 'rangeCustom' && (
                  <View style={styles.dates}>
                    <TextInput
                      style={[styles.dateInput, { fontFamily: f.body }]}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.color.inkMuted}
                      keyboardType="numbers-and-punctuation"
                      value={from}
                      onChangeText={setFrom}
                    />
                    <Text style={[styles.toWord, { fontFamily: f.label }]}>{t('toWord')}</Text>
                    <TextInput
                      style={[styles.dateInput, { fontFamily: f.body }]}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.color.inkMuted}
                      keyboardType="numbers-and-punctuation"
                      value={to}
                      onChangeText={setTo}
                    />
                  </View>
                )}
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
  dates: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    fontSize: 13,
    color: '#2c3318',
    backgroundColor: theme.color.surface,
  },
  toWord: { fontSize: 12, color: theme.color.inkFaint },

  empty: {
    textAlign: 'center',
    color: theme.color.inkMuted,
    marginTop: theme.space(6),
    paddingHorizontal: theme.space(3),
  },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.color.line,
    paddingTop: 15,
    paddingBottom: 16,
    paddingLeft: 18,
    paddingRight: 16,
    gap: theme.space(0.75),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1) },
  /* Amber, so the date reads as a tag rather than as more meta text. */
  dateTag: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: theme.radius.pillSoft,
    backgroundColor: theme.color.tagBg,
  },
  dateTagText: { fontSize: 9, letterSpacing: 1.6, color: theme.color.tagInk },
  cardSeries: { flex: 1, fontSize: 12, color: theme.color.inkMuted },
  cardTitle: { fontSize: 21, lineHeight: 25, color: theme.color.ink },
  body: { fontSize: 15, color: theme.color.inkBodySoft },
})
