import { useCallback, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { bookProgress, formatEthiopic, type LibraryDay } from '@abide/domain'
import {
  getBooks, getLibraryDays, getSummaryQuestions, type LocalBook,
} from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { fonts, theme } from '../../src/lib/theme'

export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { language, t, today } = useProfile()
  const router = useRouter()

  const [book, setBook] = useState<LocalBook | null>(null)
  const [days, setDays] = useState<LibraryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [summaryQuestionCount, setSummaryQuestionCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const [books, all, questions] = await Promise.all([
          getBooks(), getLibraryDays(), getSummaryQuestions(id as string),
        ])
        if (cancelled) return
        setSummaryQuestionCount(questions.length)
        setBook(books.find((b) => b.id === id) ?? null)
        setDays(
          all
            .filter((d) => d.bookId === id)
            // The summary day is pinned last: it is numbered after the final
            // devotion, so ordering by day number already puts it there.
            .sort((a, b) => a.dayNumber - b.dayNumber),
        )
        setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [id]),
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  const progress = bookProgress(days)
  const f = fonts(language)

  /*
   * The summary comes out of the list and becomes a card of its own.
   *
   * It was a row with a star for a number, which said nothing about what it is or
   * when it opens. As a card it can say both, and it can be plainly shut until the
   * parts before it are read — the design only draws the open state, but a member who
   * arrives halfway through should still learn that the summary is there and waiting.
   */
  const parts = days.filter((d) => d.kind !== 'summary')
  const summary = days.find((d) => d.kind === 'summary') ?? null
  const partsLeft = parts.filter((d) => !d.completed).length
  const summaryOpen = summary !== null && partsLeft === 0

  return (
    <View style={styles.screen}>
      <FlatList
        data={parts}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>
              {language === 'am' ? book?.title_am : book?.title_en}
            </Text>
            <Text style={styles.meta}>
              {t('daysCompleted', { done: progress.completed, total: progress.total })}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(progress.fraction * 100)}%` }]} />
            </View>
          </View>
        }
        ListFooterComponent={
          summary === null ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !summaryOpen }}
              disabled={!summaryOpen}
              style={[styles.summaryCard, !summaryOpen && styles.summaryCardShut]}
              onPress={() => router.push(`/day/${summary.id}`)}
            >
              <View style={[styles.summaryChip, !summaryOpen && styles.summaryChipShut]}>
                <Text
                  style={[
                    styles.summaryChipText,
                    { fontFamily: f.numeric },
                    !summaryOpen && styles.summaryChipTextShut,
                  ]}
                >
                  {summaryQuestionCount}
                </Text>
              </View>
              <View style={styles.main}>
                <Text
                  style={[
                    styles.summaryTitle,
                    { fontFamily: f.title },
                    !summaryOpen && styles.summaryTitleShut,
                  ]}
                >
                  {t('summaryKicker')}
                </Text>
                <Text
                  style={[
                    styles.summaryMeta,
                    { fontFamily: f.body },
                    !summaryOpen && styles.summaryMetaShut,
                  ]}
                >
                  {summaryOpen
                    ? t('summaryReady', { count: summaryQuestionCount })
                    : t('summaryLocked', { count: partsLeft })}
                </Text>
              </View>
              {summaryOpen && <Text style={styles.summaryArrow}>→</Text>}
            </Pressable>
          )
        }
        renderItem={({ item }) => {
          // A past day that has not been read is the actionable one: it can still
          // be backfilled, and the row says so rather than looking merely blank.
          const backfillable = !item.completed && today !== null && item.scheduledDate < today
          return (
            <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.push(`/day/${item.id}`)}>
              <View style={styles.number}>
                <Text style={styles.numberText}>
                  {item.dayNumber}
                </Text>
              </View>

              <View style={styles.main}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {language === 'am' ? item.topicAm : item.topicEn}
                </Text>
                <Text style={styles.rowMeta}>
                  {formatEthiopic(item.scheduledDate, language)}
                  {backfillable ? ` · ${t('readItLate')}` : ''}
                </Text>
              </View>

              <View style={styles.marks}>
                {item.favourite && <Text style={styles.mark}>★</Text>}
                {item.reflected && <Text style={styles.mark}>✎</Text>}
                {item.completed ? (
                  <Text style={[styles.mark, styles.markDone]}>✓</Text>
                ) : backfillable ? (
                  <Text style={[styles.mark, styles.markTodo]}>○</Text>
                ) : null}
              </View>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: theme.space(3), paddingTop: theme.space(8), gap: theme.space(1) },
  header: { gap: theme.space(1), marginBottom: theme.space(2) },
  title: { fontFamily: theme.font.body,
    fontSize: theme.size.display, fontWeight: '700', color: theme.color.ink },
  meta: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  track: { height: 6, borderRadius: 3, backgroundColor: theme.color.line, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: theme.color.flame },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(1.5),
  },
  number: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.accentSoft,
  },
  numberText: { fontFamily: theme.font.body,
    fontSize: theme.size.label, fontWeight: '700', color: theme.color.accent },
  main: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.ink },
  rowMeta: { fontFamily: theme.font.body,
    fontSize: theme.size.micro, color: theme.color.inkMuted },
  marks: { flexDirection: 'row', gap: theme.space(0.5) },
  mark: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.inkMuted },
  markDone: { color: theme.color.flame },
  markTodo: { color: theme.color.accent },

  /* Ink, so it reads as the end of the series rather than one more row in it. */
  summaryCard: {
    marginTop: theme.space(2),
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(1.5),
    backgroundColor: theme.color.inkDeep,
    borderRadius: theme.radius.lg,
    padding: theme.space(2),
  },
  summaryCardShut: { backgroundColor: theme.color.panel },
  summaryChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.accentBright,
  },
  summaryChipShut: { backgroundColor: theme.color.line },
  summaryChipText: { fontSize: 16, color: theme.color.inkDeep },
  summaryChipTextShut: { color: theme.color.inkFaint },
  summaryTitle: { fontSize: 19, color: theme.color.onInk },
  summaryMeta: { marginTop: 2, fontSize: 12.5, color: theme.color.onInkSecondary },
  summaryTitleShut: { color: theme.color.inkSecondary },
  summaryMetaShut: { color: theme.color.inkMuted },
  summaryArrow: { fontSize: 18, color: theme.color.accentBright },
})
