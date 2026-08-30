import { useCallback, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { bookProgress, formatEthiopic, type LibraryDay } from '@abide/domain'
import { getBooks, getLibraryDays, type LocalBook } from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { theme } from '../../src/lib/theme'

export default function BookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { language, t, today } = useProfile()
  const router = useRouter()

  const [book, setBook] = useState<LocalBook | null>(null)
  const [days, setDays] = useState<LibraryDay[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      void (async () => {
        const [books, all] = await Promise.all([getBooks(), getLibraryDays()])
        if (cancelled) return
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

  return (
    <View style={styles.screen}>
      <FlatList
        data={days}
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
        renderItem={({ item }) => {
          // A past day that has not been read is the actionable one: it can still
          // be backfilled, and the row says so rather than looking merely blank.
          const backfillable = !item.completed && today !== null && item.scheduledDate < today
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/day/${item.id}`)}>
              <View style={styles.number}>
                <Text style={styles.numberText}>
                  {item.kind === 'summary' ? '★' : item.dayNumber}
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
  title: { fontSize: theme.size.display, fontWeight: '700', color: theme.color.ink },
  meta: { fontSize: theme.size.label, color: theme.color.inkMuted },
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
  numberText: { fontSize: theme.size.label, fontWeight: '700', color: theme.color.accent },
  main: { flex: 1, gap: 2 },
  rowTitle: { fontSize: theme.size.body, color: theme.color.ink },
  rowMeta: { fontSize: theme.size.micro, color: theme.color.inkMuted },
  marks: { flexDirection: 'row', gap: theme.space(0.5) },
  mark: { fontSize: theme.size.body, color: theme.color.inkMuted },
  markDone: { color: theme.color.flame },
  markTodo: { color: theme.color.accent },
})
