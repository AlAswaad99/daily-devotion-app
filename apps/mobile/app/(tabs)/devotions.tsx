import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  bookProgress, filterDays, formatEthiopic, isFlatResultView, LIBRARY_FILTERS,
  type LibraryDay, type LibraryFilter,
} from '@abide/domain'
import { getBooks, getLibraryDays, type LocalBook } from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { PaperBackdrop } from '../../src/components/Backdrop'
import { Icon } from '../../src/components/Icon'
import { DayRow } from '../../src/components/DayRow'
import {
  Chip, ChipRow, Kicker, PaperCard, ProgressBar, RiseFade, Subtitle, Title, UiText,
} from '../../src/components/ui'
import { RANGES, inRange, type RangeKey } from '../../src/lib/ranges'
import { translate } from '../../src/lib/i18n'
import { fonts, theme } from '../../src/lib/theme'

/**
 * The devotions library: current and past books only.
 *
 * Future books are invisible here for free — the local database only ever holds days
 * scheduled on or before today, so there is no filter that could be forgotten. A book
 * with no visible day is not listed at all.
 *
 * Two views in one screen, as the design has it: a stack of series cards when nothing
 * is applied, and a flat list of days the moment a search, a status or a date range is.
 */
export default function Devotions() {
  const { language, t, today, sync } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [books, setBooks] = useState<LocalBook[]>([])
  const [days, setDays] = useState<LibraryDay[]>([])
  const [filter, setFilter] = useState<LibraryFilter>('all')
  const [range, setRange] = useState<RangeKey>('rangeAll')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const reload = useCallback(async () => {
    const [b, d] = await Promise.all([getBooks(), getLibraryDays()])
    setBooks(b)
    setDays(d)
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

  const query = useMemo(() => ({ filter, search, language }), [filter, search, language])
  const byStatus = useMemo(() => filterDays(days, query), [days, query])
  const results = useMemo(
    () => byStatus.filter((d) => inRange(d.scheduledDate, range, from, to)),
    [byStatus, range, from, to],
  )
  /* Any narrowing at all switches to the flat list — including a date range. */
  const flat = isFlatResultView(query) || range !== 'rangeAll'

  const f = fonts(language)

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperBackdrop />
        <ActivityIndicator color={theme.color.accent} />
      </View>
    )
  }

  const header = (
    <View style={styles.header}>
      <Kicker language={language} size={12}>
        {t('libraryKicker')}
      </Kicker>
      <View style={styles.titleRow}>
        <Title language={language} size={34} accessibilityRole="header" style={styles.title}>
          {t('devotionsTab')}
        </Title>
        <UiText language={language} size={12} colour={theme.color.inkFaint} style={styles.count}>
          {t('devotionCount', { count: days.length })}
        </UiText>
      </View>

      <View style={styles.search}>
        <Icon name="search" size={18} colour={theme.color.inkFaint} />
        <TextInput
          style={[styles.searchInput, { fontFamily: f.body }]}
          placeholder={t('librarySearchPlaceholder')}
          placeholderTextColor={theme.color.inkMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setSearch('')}>
            <Text style={styles.clear}>✕</Text>
          </Pressable>
        )}
      </View>

      <ChipRow>
        {LIBRARY_FILTERS.map((key) => (
          <Chip
            key={key}
            label={t(`filter_${key}` as 'filter_all')}
            on={filter === key}
            language={language}
            onPress={() => setFilter(key)}
          />
        ))}
      </ChipRow>

      <ChipRow>
        {RANGES.map((r) => (
          <Chip
            key={r}
            small
            label={t(r)}
            on={range === r}
            language={language}
            onPress={() => setRange(r)}
          />
        ))}
      </ChipRow>

      {range === 'rangeCustom' && (
        /*
         * Two plain fields rather than a date picker.
         *
         * The design uses `<input type="date">`, which has no React Native equivalent
         * without another native dependency. Typed ISO dates work offline, read the same
         * in both languages, and are what the filter compares anyway.
         */
        <View style={styles.dates}>
          <TextInput
            style={[styles.date, { fontFamily: f.body }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.color.inkMuted}
            keyboardType="numbers-and-punctuation"
            value={from}
            onChangeText={setFrom}
          />
          <UiText language={language} size={12} colour={theme.color.inkFaint}>
            {t('toWord')}
          </UiText>
          <TextInput
            style={[styles.date, { fontFamily: f.body }]}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.color.inkMuted}
            keyboardType="numbers-and-punctuation"
            value={to}
            onChangeText={setTo}
          />
        </View>
      )}

      {flat && (
        <Kicker
          language={language}
          size={10}
          colour={theme.color.inkFaint}
          style={styles.resultCount}
        >
          {results.length === 1
            ? t('resultCountOne')
            : t('resultCount', { count: results.length })}
        </Kicker>
      )}
    </View>
  )

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      {flat ? (
        <FlatList
          data={results}
          keyExtractor={(d) => d.id}
          contentContainerStyle={[styles.list, { paddingTop: insets.top + 2 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={[styles.empty, { fontFamily: f.body }]}>{t('noneMatch')}</Text>
          }
          renderItem={({ item }) => (
            <DayRow
              day={item}
              language={language}
              today={today}
              series={seriesTitle(books, item, language)}
              onPress={() => router.push(`/day/${item.id}`)}
            />
          )}
        />
      ) : (
        <FlatList
          data={sortedBooks(books, days, today)}
          keyExtractor={(b) => b.id}
          contentContainerStyle={[styles.list, { paddingTop: insets.top + 2 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={[styles.empty, { fontFamily: f.body }]}>{t('noContentYet')}</Text>
          }
          renderItem={({ item }) => (
            <SeriesCard
              book={item}
              days={days.filter((d) => d.bookId === item.id)}
              language={language}
              today={today}
              onPress={() => router.push(`/book/${item.id}`)}
            />
          )}
        />
      )}
    </View>
  )
}

/** The series a day belongs to, for the sub-line on a library row. */
function seriesTitle(books: LocalBook[], day: LibraryDay, language: 'en' | 'am'): string | undefined {
  const book = books.find((b) => b.id === day.bookId)
  if (!book) return undefined
  return language === 'am' ? book.title_am : book.title_en
}

/** Current series first, then those in progress, then the finished ones. */
function sortedBooks(books: LocalBook[], days: LibraryDay[], today: string | null): LocalBook[] {
  const rank = (book: LocalBook) => {
    const own = days.filter((d) => d.bookId === book.id)
    const progress = bookProgress(own)
    if (own.some((d) => d.scheduledDate === today)) return 0
    return progress.total > 0 && progress.completed >= progress.total ? 2 : 1
  }
  return [...books].sort((a, b) => rank(a) - rank(b))
}

function SeriesCard({
  book,
  days,
  language,
  today,
  onPress,
}: {
  book: LocalBook
  days: LibraryDay[]
  language: 'en' | 'am'
  today: string | null
  onPress: () => void
}) {
  const progress = bookProgress(days)
  const complete = progress.total > 0 && progress.completed >= progress.total
  const current = today !== null && days.some((d) => d.scheduledDate === today)
  const pct = Math.round(progress.fraction * 100)
  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) =>
    translate(key, language, vars)

  const badge = current
    ? { label: t('badgeContinue'), bg: theme.color.inkDeep, fg: theme.color.accentBright, border: 'transparent' }
    : complete
      ? { label: t('badgeComplete'), bg: theme.color.accentPale, fg: theme.color.accentDeep, border: 'transparent' }
      : { label: t('badgeInProgress'), bg: 'transparent', fg: theme.color.inkMuted, border: theme.color.line }

  return (
    <RiseFade duration={400}>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <PaperCard radius={theme.radius.lg} lift="big" style={styles.seriesCard}>
          <View style={styles.seriesHead}>
            <View style={styles.seriesIcon}>
              <Icon name="bible" size={22} colour={theme.color.accent} />
            </View>
            <View style={styles.seriesText}>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: badge.bg, borderColor: badge.border },
                ]}
              >
                <Kicker language={language} size={9} tracking={1.6} colour={badge.fg}>
                  {badge.label}
                </Kicker>
              </View>
              <Subtitle language={language} size={24} style={styles.seriesName}>
                {language === 'am' ? book.title_am : book.title_en}
              </Subtitle>
            </View>
            <View style={styles.seriesArrow}>
              <Text style={styles.seriesArrowGlyph}>→</Text>
            </View>
          </View>

          <View style={styles.seriesBar}>
            <ProgressBar fraction={progress.fraction} height={5} style={styles.bar} />
            <Kicker language={language} size={11.5} tracking={0} colour={theme.color.accent}>
              {pct}%
            </Kicker>
          </View>

          <UiText language={language} size={11.5} colour={theme.color.inkMuted} style={styles.seriesMeta}>
            {t('partsProgress', { done: progress.completed, total: progress.total })}
          </UiText>
        </PaperCard>
      </Pressable>
    </RiseFade>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: 20,
    paddingBottom: theme.layout.navClearance,
    gap: 12,
  },

  header: { gap: 10, paddingHorizontal: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: -6 },
  title: { flex: 1 },
  count: { paddingBottom: 8 },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#2c3318', padding: 0 },
  clear: { fontSize: 16, lineHeight: 18, color: theme.color.inkFaint },

  dates: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  date: {
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
  resultCount: { marginTop: 4 },

  empty: {
    textAlign: 'center',
    marginTop: 26,
    paddingHorizontal: 20,
    fontSize: 15,
    color: theme.color.inkFaint,
  },

  seriesCard: { paddingVertical: 16, paddingLeft: 18, paddingRight: 16 },
  seriesHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  seriesIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.tile,
    backgroundColor: 'rgba(94,126,51,.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  seriesText: { flex: 1, minWidth: 0 },
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: theme.radius.pillSoft,
    borderWidth: 1,
  },
  seriesName: { marginTop: 6 },
  seriesArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.color.inkDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seriesArrowGlyph: { fontSize: 15, lineHeight: 17, color: theme.color.accentBright },

  seriesBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  bar: { flex: 1 },
  seriesMeta: { marginTop: 7 },
})
