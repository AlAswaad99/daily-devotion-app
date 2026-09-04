import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bookProgress } from '@abide/domain'
import { CtaGradient, InkBackdrop } from '../../../src/components/Backdrop'
import { Confetti } from '../../../src/components/Confetti'
import { Mascot } from '../../../src/components/Mascot'
import {
  getBooks, getLibraryDays, seriesStats, type LocalBook, type SeriesStats,
} from '../../../src/data/repository'
import { useProfile } from '../../../src/lib/profile'
import { lineHeightFor } from '../../../src/lib/i18n'
import { fonts, theme } from '../../../src/lib/theme'

/**
 * The end of a series.
 *
 * Reached from the summary day rather than from finishing the last part, because the
 * summary is the last thing in the series and arriving here before answering it would
 * celebrate something not yet done.
 *
 * A route rather than a modal over the reader: it is a place the member can be sent
 * back to the library from, and "start the next series" has to replace this screen in
 * the stack rather than stack on top of it.
 */
export default function SeriesComplete() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile, language, t } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [book, setBook] = useState<LocalBook | null>(null)
  const [stats, setStats] = useState<SeriesStats | null>(null)
  const [nextBook, setNextBook] = useState<LocalBook | null>(null)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const [books, days, counts] = await Promise.all([
          getBooks(), getLibraryDays(), seriesStats(id),
        ])
        if (cancelled) return
        setBook(books.find((b) => b.id === id) ?? null)
        setStats(counts)
        /*
         * The next series is the first unfinished one that is not this one. Books come
         * back in reading order, so "first" is the one the ministry meant next rather
         * than whichever happens to be least complete.
         */
        setNextBook(
          books.find((b) => {
            if (b.id === id) return false
            const progress = bookProgress(days.filter((d) => d.bookId === b.id))
            return progress.total > 0 && progress.completed < progress.total
          }) ?? null,
        )
      })()
      return () => {
        cancelled = true
      }
    }, [id]),
  )

  if (!stats || !book) {
    return (
      <View style={styles.centered}>
        <InkBackdrop variant="streak" />
        <ActivityIndicator color={theme.color.accentBright} />
      </View>
    )
  }

  const f = fonts(language)
  const title = language === 'am' ? book.title_am : book.title_en
  const name = profile?.display_name?.trim() ?? ''

  return (
    <View style={styles.screen}>
      <InkBackdrop variant="streak" />
      <Confetti />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + theme.space(4), paddingBottom: insets.bottom + theme.space(3) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Mascot mood="celebrating" size={120} style={styles.mascot} />

        <Text style={[styles.kicker, { fontFamily: f.label }]}>{t('seriesCompleteKicker')}</Text>
        <Text
          accessibilityRole="header"
          style={[styles.title, { fontFamily: f.title, lineHeight: 44 }]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.wellDone,
            { fontFamily: f.italic, lineHeight: lineHeightFor(language, 17) },
          ]}
        >
          {name.length > 0 ? t('wellDoneNamed', { name }) : t('wellDone')}
        </Text>

        <View style={styles.tiles}>
          <Tile value={stats.parts} label={t('statParts')} language={language} />
          <Tile value={stats.reflections} label={t('statReflections')} language={language} />
          <Tile value={stats.days} label={t('statDays')} language={language} />
        </View>

        <View style={styles.actions}>
          {nextBook !== null && (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
              /* Replace, not push: the finished series is not somewhere to go back to. */
              onPress={() => router.replace(`/book/${nextBook.id}`)}
            >
              <CtaGradient style={styles.ctaFill} />
              <Text style={[styles.ctaText, { fontFamily: f.label }]}>{t('startNextSeries')}</Text>
              <Text style={[styles.ctaArrow, { fontFamily: f.label }]}>→</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            style={styles.secondary}
            onPress={() => router.replace('/devotions')}
          >
            <Text style={[styles.secondaryText, { fontFamily: f.body }]}>
              {t('backToDevotions')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

function Tile({
  value,
  label,
  language,
}: {
  value: number
  label: string
  language: 'en' | 'am'
}) {
  const f = fonts(language)
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { fontFamily: f.numeric }]}>{value}</Text>
      <Text style={[styles.tileLabel, { fontFamily: f.label }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.inkDarkest },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.layout.screenPadding,
    alignItems: 'center',
  },

  mascot: { marginBottom: theme.space(3) },
  kicker: {
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kickerWide,
    color: theme.color.onInkSecondary,
  },
  title: {
    marginTop: theme.space(1),
    fontSize: 42,
    color: theme.color.onInk,
    textAlign: 'center',
  },
  wellDone: {
    marginTop: theme.space(1.5),
    fontSize: 17,
    color: theme.color.onInkSecondary,
    textAlign: 'center',
  },

  tiles: {
    marginTop: theme.space(4),
    flexDirection: 'row',
    gap: theme.space(1.5),
    alignSelf: 'stretch',
  },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,.06)',
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(2),
    alignItems: 'center',
    gap: 2,
  },
  tileValue: { fontSize: 30, lineHeight: 34, color: theme.color.onInk },
  tileLabel: {
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.onInkDim,
    textAlign: 'center',
  },

  /* Pinned to the bottom of the scroll area, which grows to fill a tall screen. */
  actions: { marginTop: 'auto', paddingTop: theme.space(4), alignSelf: 'stretch', gap: theme.space(1) },
  cta: {
    height: theme.layout.ctaHeight,
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    ...theme.shadow.cta,
  },
  ctaPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  ctaFill: { borderRadius: theme.radius.md },
  ctaText: { fontSize: 15, letterSpacing: 0.4, color: theme.color.inkDeep },
  ctaArrow: { fontSize: 16, color: theme.color.inkDeep },
  secondary: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 12 },
  secondaryText: { fontSize: 14.5, color: theme.color.onInkSecondary },
})
