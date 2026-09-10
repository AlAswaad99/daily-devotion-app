import { useCallback, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bookProgress, type LibraryDay } from '@abide/domain'
import {
  getBooks, getLibraryDays, getSummaryQuestions, type LocalBook,
} from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { PaperBackdrop } from '../../src/components/Backdrop'
import { DayRow } from '../../src/components/DayRow'
import {
  Kicker, ProgressBar, RiseFade, ScreenHeader, Subtitle, Title, UiText,
} from '../../src/components/ui'
import { fonts, theme } from '../../src/lib/theme'

/**
 * One series, part by part.
 *
 * The summary comes out of the list and becomes a card of its own. It was a row with a
 * star for a number, which said nothing about what it is or when it opens. As a card it
 * can say both, and it can be plainly shut until the parts before it are read — the
 * design only draws the open state, but a member who arrives halfway through should
 * still learn that the summary is there and waiting.
 */
export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { language, t, today } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [book, setBook] = useState<LocalBook | null>(null)
  const [days, setDays] = useState<LibraryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [questionCount, setQuestionCount] = useState(0)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const [books, all, questions] = await Promise.all([
          getBooks(), getLibraryDays(), getSummaryQuestions(id as string),
        ])
        if (cancelled) return
        setQuestionCount(questions.length)
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
        <PaperBackdrop />
        <ActivityIndicator color={theme.color.accent} />
      </View>
    )
  }

  const f = fonts(language)
  const progress = bookProgress(days)
  const parts = days.filter((d) => d.kind !== 'summary')
  const summary = days.find((d) => d.kind === 'summary') ?? null
  const partsLeft = parts.filter((d) => !d.completed).length
  const summaryOpen = summary !== null && !summary.locked && partsLeft === 0

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <FlatList
        data={parts}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[
          styles.list,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              kicker={t('seriesKicker')}
              language={language}
              backLabel={t('back')}
              onBack={() => router.back()}
              style={styles.headerRow}
            />

            <View style={styles.titleBlock}>
              <Title language={language} size={36} accessibilityRole="header">
                {language === 'am' ? book?.title_am : book?.title_en}
              </Title>

              <View style={styles.metaRow}>
                <UiText language={language} size={12} colour={theme.color.kicker} style={styles.meta}>
                  {t('partsProgress', { done: progress.completed, total: progress.total })}
                </UiText>
                <Kicker language={language} size={12} tracking={0} colour={theme.color.accent}>
                  {Math.round(progress.fraction * 100)}%
                </Kicker>
              </View>

              <ProgressBar fraction={progress.fraction} style={styles.bar} />
            </View>
          </View>
        }
        ListFooterComponent={
          summary === null ? null : (
            <RiseFade>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !summaryOpen }}
                disabled={!summaryOpen}
                style={[styles.summary, !summaryOpen && styles.summaryShut]}
                onPress={() => router.push(`/day/${summary.id}`)}
              >
                <View style={[styles.summaryChip, !summaryOpen && styles.summaryChipShut]}>
                  <Text
                    style={[
                      styles.summaryChipText,
                      { fontFamily: f.labelStrong },
                      !summaryOpen && styles.summaryChipTextShut,
                    ]}
                  >
                    {questionCount}
                  </Text>
                </View>

                <View style={styles.summaryText}>
                  <Subtitle
                    language={language}
                    size={19}
                    colour={summaryOpen ? theme.color.onInk : theme.color.inkSecondary}
                  >
                    {t('seriesSummaryTitle')}
                  </Subtitle>
                  <UiText
                    language={language}
                    size={11}
                    colour={summaryOpen ? theme.color.onInkSecondary : theme.color.inkMuted}
                    style={styles.summaryMeta}
                  >
                    {summaryOpen
                      ? t('summaryReady', { count: questionCount })
                      : t('summaryLocked', { count: partsLeft })}
                  </UiText>
                </View>

                {summaryOpen && (
                  <View style={styles.summaryArrow}>
                    <Text style={styles.summaryArrowGlyph}>→</Text>
                  </View>
                )}
              </Pressable>
            </RiseFade>
          )
        }
        renderItem={({ item }) => (
          <DayRow
            day={item}
            language={language}
            today={today}
            onPress={() => router.push(`/day/${item.id}`)}
          />
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingBottom: theme.layout.navClearance, gap: 9 },

  header: { marginBottom: 9 },
  headerRow: { paddingHorizontal: 0 },
  titleBlock: { paddingHorizontal: 6, paddingTop: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  meta: { flex: 1 },
  bar: { marginTop: 10 },

  /* Ink, so it reads as the end of the series rather than one more row in it. */
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    marginTop: 4,
    paddingVertical: 15,
    paddingLeft: 16,
    paddingRight: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.inkDeep,
    ...theme.shadow.cardBig,
  },
  summaryShut: { backgroundColor: theme.color.panel },
  summaryChip: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.accentMid,
  },
  summaryChipShut: { backgroundColor: theme.color.line },
  summaryChipText: { fontSize: 12.5, lineHeight: 15, color: theme.color.inkDeep },
  summaryChipTextShut: { color: theme.color.inkFaint },
  summaryText: { flex: 1, minWidth: 0 },
  summaryMeta: { marginTop: 3 },
  summaryArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(169,200,106,.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryArrowGlyph: { fontSize: 14, lineHeight: 16, color: theme.color.accentBright },
})
