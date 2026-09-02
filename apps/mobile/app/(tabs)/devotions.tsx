import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  bookProgress, filterDays, formatEthiopic, isFlatResultView, LIBRARY_FILTERS,
  type LibraryDay, type LibraryFilter,
} from '@abide/domain'
import { getBooks, getLibraryDays, type LocalBook } from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { theme } from '../../src/lib/theme'

/**
 * The devotions library: current and past books only.
 *
 * Future books are invisible here for free — the local database only ever holds
 * days scheduled on or before today, so there is no filter that could be forgotten.
 * A book with no visible day is not listed at all.
 */
export default function Devotions() {
  const { language, t } = useProfile()
  const router = useRouter()

  const [books, setBooks] = useState<LocalBook[]>([])
  const [days, setDays] = useState<LibraryDay[]>([])
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const [b, d] = await Promise.all([getBooks(), getLibraryDays()])
        if (cancelled) return
        setBooks(b)
        setDays(d)
        setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, []),
  )

  const query = useMemo(() => ({ filter, search, language }), [filter, search, language])
  const results = useMemo(() => filterDays(days, query), [days, query])
  const flat = isFlatResultView(query)

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>{t('devotionsTab')}</Text>

      <TextInput
        style={styles.search}
        placeholder={t('searchDevotions')}
        placeholderTextColor={theme.color.inkMuted}
        value={search}
        onChangeText={setSearch}
      />

      <View style={styles.filters}>
        {LIBRARY_FILTERS.map((key) => (
          <Pressable
            key={key}
            style={[styles.chip, filter === key && styles.chipOn]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.chipText, filter === key && styles.chipTextOn]}>
              {t(`filter_${key}` as never)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* A flat result list whenever anything is applied; the book listing otherwise. */}
      {flat ? (
        <FlatList
          data={results}
          keyExtractor={(d) => d.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('noResults')}</Text>}
          renderItem={({ item }) => (
            <DayRow day={item} language={language} onPress={() => router.push(`/day/${item.id}`)} />
          )}
        />
      ) : (
        <FlatList
          data={books}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t('noContentYet')}</Text>}
          renderItem={({ item }) => {
            const bookDays = days.filter((d) => d.bookId === item.id)
            const progress = bookProgress(bookDays)
            return (
              <Pressable style={styles.bookCard} onPress={() => router.push(`/book/${item.id}`)}>
                <Text style={styles.bookTitle}>
                  {language === 'am' ? item.title_am : item.title_en}
                </Text>
                <Text style={styles.bookMeta}>
                  {t('daysCompleted', { done: progress.completed, total: progress.total })}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(progress.fraction * 100)}%` }]} />
                </View>
              </Pressable>
            )
          }}
        />
      )}
    </View>
  )
}

function DayRow({
  day, language, onPress,
}: {
  day: LibraryDay
  language: 'en' | 'am'
  onPress: () => void
}) {
  return (
    <Pressable style={styles.dayRow} onPress={onPress}>
      <View style={styles.dayMain}>
        <Text style={styles.dayTitle} numberOfLines={1}>
          {language === 'am' ? day.topicAm : day.topicEn}
        </Text>
        <Text style={styles.dayMeta}>{formatEthiopic(day.scheduledDate, language)}</Text>
      </View>
      <View style={styles.marks}>
        {day.favourite && <Text style={styles.mark}>★</Text>}
        {day.reflected && <Text style={styles.mark}>✎</Text>}
        {day.completed && <Text style={[styles.mark, styles.markDone]}>✓</Text>}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg, paddingTop: theme.space(7) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: {
    fontFamily: theme.font.body,
    fontSize: theme.size.display,
    fontWeight: '700',
    color: theme.color.ink,
    paddingHorizontal: theme.space(3),
    marginBottom: theme.space(1.5),
  },
  search: {
    marginHorizontal: theme.space(3),
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space(1.75),
    paddingVertical: theme.space(1.25),
    fontFamily: theme.font.body,
    fontSize: theme.size.body,
    color: theme.color.ink,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space(1),
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(1.5),
  },
  chip: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(0.75),
    paddingHorizontal: theme.space(1.5),
    backgroundColor: theme.color.surface,
  },
  chipOn: { backgroundColor: theme.color.ink, borderColor: theme.color.ink },
  chipText: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.ink },
  chipTextOn: { color: theme.color.surface, fontWeight: '600' },
  list: { padding: theme.space(3), paddingTop: 0, gap: theme.space(1.5) },
  empty: { textAlign: 'center', color: theme.color.inkMuted, marginTop: theme.space(4) },
  bookCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2.5),
    gap: theme.space(1),
  },
  bookTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.title, fontWeight: '600', color: theme.color.ink },
  bookMeta: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.line,
    overflow: 'hidden',
  },
  fill: { height: 6, backgroundColor: theme.color.flame },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2),
    gap: theme.space(1),
  },
  dayMain: { flex: 1, gap: 2 },
  dayTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.ink },
  dayMeta: { fontFamily: theme.font.body,
    fontSize: theme.size.micro, color: theme.color.inkMuted },
  marks: { flexDirection: 'row', gap: theme.space(0.75) },
  mark: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.inkMuted },
  markDone: { color: theme.color.flame },
})
