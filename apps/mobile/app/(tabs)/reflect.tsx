import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { formatEthiopic, matchesQuery } from '@abide/domain'
import { listReflections, type ReflectionEntry } from '../../src/data/repository'
import { useProfile } from '../../src/lib/profile'
import { lineHeightFor } from '../../src/lib/i18n'
import { theme } from '../../src/lib/theme'

/**
 * Everything the user has written, newest first.
 *
 * Private: no sharing and no export in v1, and nothing here ever reaches an admin —
 * the reflections table has no admin policy at all, which is a database guarantee
 * rather than a promise this screen makes.
 */
export default function Reflect() {
  const { language, t } = useProfile()
  const router = useRouter()

  const [entries, setEntries] = useState<ReflectionEntry[]>([])
  const [search, setSearch] = useState('')
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

  // Searching your own writing has the same Ethiopic folding problem as the
  // library, and the same fix.
  const results = useMemo(
    () => entries.filter((e) => matchesQuery(`${e.body} ${e.topic_en} ${e.topic_am}`, search)),
    [entries, search],
  )

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>{t('reflectTab')}</Text>

      {entries.length > 0 && (
        <TextInput
          style={styles.search}
          placeholder={t('searchReflections')}
          placeholderTextColor={theme.color.inkMuted}
          value={search}
          onChangeText={setSearch}
        />
      )}

      <FlatList
        data={results}
        keyExtractor={(e) => `${e.devotion_day_id}:${e.question_ordinal}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {entries.length === 0 ? t('noReflectionsYet') : t('noResults')}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/day/${item.devotion_day_id}`)}
          >
            <Text style={styles.cardMeta}>
              {formatEthiopic(item.scheduled_date, language)} ·{' '}
              {language === 'am' ? item.topic_am : item.topic_en}
            </Text>
            <Text
              style={[styles.body, { lineHeight: lineHeightFor(language, theme.size.body) }]}
              numberOfLines={6}
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
  screen: { flex: 1, backgroundColor: theme.color.bg, paddingTop: theme.space(7) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: {
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
    fontSize: theme.size.body,
    color: theme.color.ink,
  },
  list: { padding: theme.space(3), gap: theme.space(1.5) },
  empty: { textAlign: 'center', color: theme.color.inkMuted, marginTop: theme.space(6) },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2),
    gap: theme.space(0.75),
  },
  cardMeta: { fontSize: theme.size.micro, color: theme.color.inkMuted },
  body: { fontSize: theme.size.body, color: theme.color.ink },
})
