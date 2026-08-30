import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { supabase } from '../src/lib/supabase'
import { useSession } from '../src/lib/session'
import { useProfile } from '../src/lib/profile'
import { theme } from '../src/lib/theme'
import { lineHeightFor } from '../src/lib/i18n'
import { formatEthiopic } from '@abide/domain'

interface TodayRow {
  id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  topic_am: string
  scheduled_date: string
  expected_seconds: number
  books: { title_en: string; title_am: string; rounds: { phase_code: string; round_code: string; main_verse_en: string; main_verse_am: string } } | null
}

export default function Today() {
  const { session, loading: sessionLoading } = useSession()
  const { profile, streak, today, loading: profileLoading, language, t, refresh } = useProfile()
  const router = useRouter()

  const [day, setDay] = useState<TodayRow | null>(null)
  const [complete, setComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!session || !today) return
    setError(null)

    const { data, error } = await supabase
      .from('devotion_days')
      .select(
        'id, day_number, kind, topic_en, topic_am, scheduled_date, expected_seconds,' +
          ' books!inner(title_en, title_am, rounds!inner(phase_code, round_code, main_verse_en, main_verse_am))',
      )
      .eq('scheduled_date', today)
      .maybeSingle()

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const row = data as unknown as TodayRow | null
    setDay(row)

    if (row) {
      const { data: done } = await supabase
        .from('day_completions')
        .select('method')
        .eq('devotion_day_id', row.id)
        .maybeSingle()
      setComplete(done !== null)
    }
    setLoading(false)
  }, [session, today])

  useEffect(() => {
    void load()
  }, [load])

  // Coming back from the detail screen must refresh the card and the flame.
  useFocusEffect(
    useCallback(() => {
      void refresh()
      void load()
    }, [refresh, load]),
  )

  if (sessionLoading || profileLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  if (!session) return <Redirect href="/sign-in" />
  if (!profile) return <Redirect href="/onboarding" />

  const round = day?.books?.rounds
  const title = language === 'am' ? day?.topic_am : day?.topic_en
  const bookTitle = language === 'am' ? day?.books?.title_am : day?.books?.title_en

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => { void refresh(); void load() }} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{t('todayGreeting')}</Text>
          <Text style={styles.name}>{profile.display_name}</Text>
        </View>

        {/* The flame is the way into the streak screen. */}
        <Pressable style={styles.flame} onPress={() => router.push('/streak')}>
          <Text style={styles.flameGlyph}>{(streak?.current ?? 0) > 0 ? '🔥' : '·'}</Text>
          <Text style={styles.flameCount}>{streak?.current ?? 0}</Text>
        </Pressable>
      </View>

      {/* Round header: phase, round, main verse. Church and ministry are never shown. */}
      {round && (
        <View style={styles.roundHeader}>
          <Text style={styles.roundLabel}>
            Phase {round.phase_code} · Round {round.round_code}
          </Text>
          <Text style={[styles.mainVerse, { lineHeight: lineHeightFor(language, theme.size.body) }]}>
            {language === 'am' ? round.main_verse_am : round.main_verse_en}
          </Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {!loading && !day && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>{t('comingSoon')}</Text>
          <Text style={[styles.body, { lineHeight: lineHeightFor(language, theme.size.body) }]}>
            {t('comingSoonBody')}
          </Text>
        </View>
      )}

      {day && (
        <Pressable style={styles.card} onPress={() => router.push(`/day/${day.id}`)}>
          <Text style={styles.cardEyebrow}>
            {complete ? t('alreadyDone') : t('todaysDevotion')}
          </Text>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardMeta}>
            {bookTitle} · {t('dayNumber', { n: day.day_number })} ·{' '}
            {formatEthiopic(day.scheduled_date, language)}
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{complete ? t('completed') : t('read')}</Text>
          </View>
        </Pressable>
      )}

      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>{t('signOut')}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: theme.space(3), paddingTop: theme.space(8), gap: theme.space(3) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: theme.size.label, color: theme.color.inkMuted },
  name: { fontSize: theme.size.title, fontWeight: '600', color: theme.color.ink },
  flame: { alignItems: 'center', paddingHorizontal: theme.space(1.5), paddingVertical: theme.space(1) },
  flameGlyph: { fontSize: 24 },
  flameCount: { fontSize: theme.size.label, fontWeight: '700', color: theme.color.flame },
  roundHeader: {
    borderLeftWidth: 3,
    borderLeftColor: theme.color.accent,
    paddingLeft: theme.space(2),
    gap: theme.space(0.5),
  },
  roundLabel: {
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.inkMuted,
  },
  mainVerse: { fontSize: theme.size.body, color: theme.color.ink, fontStyle: 'italic' },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space(3),
    gap: theme.space(1),
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  cardEyebrow: {
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.accent,
  },
  cardTitle: { fontSize: theme.size.title, fontWeight: '600', color: theme.color.ink },
  cardMeta: { fontSize: theme.size.label, color: theme.color.inkMuted },
  body: { fontSize: theme.size.body, color: theme.color.ink },
  cta: {
    marginTop: theme.space(1),
    alignSelf: 'flex-start',
    backgroundColor: theme.color.ink,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(1.25),
    paddingHorizontal: theme.space(3),
  },
  ctaText: { color: theme.color.surface, fontWeight: '600' },
  error: { color: theme.color.danger },
  signOut: { alignSelf: 'center', marginTop: theme.space(4), padding: theme.space(1) },
  signOutText: { color: theme.color.inkMuted },
})
