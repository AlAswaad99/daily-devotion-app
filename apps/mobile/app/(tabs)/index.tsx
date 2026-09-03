import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { useSession } from '../../src/lib/session'
import { useProfile } from '../../src/lib/profile'
import {
  contentCounts, getCompletion, getDayForDate, type LocalDay,
} from '../../src/data/repository'
import { log } from '../../src/lib/log'
import { theme } from '../../src/lib/theme'
import { lineHeightFor } from '../../src/lib/i18n'
import { formatEthiopic } from '@abide/domain'
import { Sky } from '../../src/components/Sky'
import { Mascot } from '../../src/components/Mascot'

export default function Today() {
  const { session, loading: sessionLoading } = useSession()
  const { profile, streak, today, loading: profileLoading, language, t, sync, queued } =
    useProfile()
  const router = useRouter()

  const [day, setDay] = useState<LocalDay | null>(null)
  const [cached, setCached] = useState<{ days: number; books: number; rounds: number } | null>(null)
  const [complete, setComplete] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const counts = await contentCounts()
    setCached(counts)

    if (!today) {
      log.info('today', 'no ministry date cached yet; waiting for a sync', counts)
      setLoading(false)
      return
    }

    // Local only. There is no spinner waiting on a network here, by design.
    const row = await getDayForDate(today)
    log.info('today', 'local lookup', { today, found: Boolean(row), ...counts })
    setDay(row)
    setComplete(row ? (await getCompletion(row.id)) !== null : false)
    setLoading(false)
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  // Coming back from the detail screen must refresh the card and the flame.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (sessionLoading || profileLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  if (!session) return <Redirect href="/welcome" />
  if (!profile) return <Redirect href="/onboarding" />

  const title = language === 'am' ? day?.topic_am : day?.topic_en
  const bookTitle = language === 'am' ? day?.book_title_am : day?.book_title_en

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
          <RefreshControl
          refreshing={loading}
          onRefresh={async () => {
            // Pull-to-refresh is the manual way to ask for a sync.
            await sync({ force: true })
            await load()
          }}
        />
      }
    >
      {/* Behind everything: the wash that says what time of day it is. */}
      <Sky />

      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{t('todayGreeting')}</Text>
          <Text style={styles.name}>{profile.display_name}</Text>
        </View>

        <Mascot
          mood={complete ? 'pleased' : (streak?.current ?? 0) > 0 ? 'waiting' : 'idle'}
        />

        {/* The flame is the way into the streak screen. */}
        <Pressable
          accessibilityRole="button"
          // The flame is an emoji and the count a bare number; together they say
          // nothing aloud. Spoken, this is the whole meaning of the control.
          accessibilityLabel={`${t('streakLabel')}: ${streak?.current ?? 0}`}
          style={styles.flame}
          onPress={() => router.push('/streak')}
        >
          <Text style={styles.flameGlyph}>{(streak?.current ?? 0) > 0 ? '🔥' : '·'}</Text>
          <Text style={styles.flameCount}>{streak?.current ?? 0}</Text>
        </Pressable>
      </View>

      {/* Round header: phase, round, main verse. Church and ministry are never shown. */}
      {day?.phase_code && (
        <View style={styles.roundHeader}>
          <Text style={styles.roundLabel}>
            Phase {day.phase_code} · Round {day.round_code}
          </Text>
          <Text style={[styles.mainVerse, { lineHeight: lineHeightFor(language, theme.size.body) }]}>
            {language === 'am' ? day.main_verse_am : day.main_verse_en}
          </Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {/*
        An empty cache is not a finished round. Saying "coming soon" when this phone
        has simply never synced would be a lie, and the wrong lie: it tells the user
        to wait when what they need is to retry.
      */}
      {/*
        Without a ministry date nothing can be concluded — not that the round has
        ended, not that today is missing. Say so and offer a retry.
      */}
      {!loading && !today && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>{t('notSyncedYet')}</Text>
          <Text style={[styles.body, { lineHeight: lineHeightFor(language, theme.size.body) }]}>
            {t('notSyncedYetBody')}
          </Text>
          <Pressable accessibilityRole="button" style={styles.cta} onPress={() => void sync({ force: true }).then(load)}>
            <Text style={styles.ctaText}>{t('retry')}</Text>
          </Pressable>
        </View>
      )}

      {!loading && today && !day && cached?.days === 0 && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>{t('noContentYet')}</Text>
          <Text style={[styles.body, { lineHeight: lineHeightFor(language, theme.size.body) }]}>
            {t('noContentYetBody')}
          </Text>
          <Pressable accessibilityRole="button" style={styles.cta} onPress={() => void sync({ force: true }).then(load)}>
            <Text style={styles.ctaText}>{t('retry')}</Text>
          </Pressable>
        </View>
      )}

      {/* Only a known date with content and no day for it means the round ended. */}
      {!loading && today && !day && (cached?.days ?? 0) > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardEyebrow}>{t('comingSoon')}</Text>
          <Text style={[styles.body, { lineHeight: lineHeightFor(language, theme.size.body) }]}>
            {t('comingSoonBody')}
          </Text>
        </View>
      )}

      {day && (
        <Pressable accessibilityRole="button" style={styles.card} onPress={() => router.push(`/day/${day.id}`)}>
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

      {queued > 0 && (
        <Text style={styles.queued}>{t('waitingToSync', { count: queued })}</Text>
      )}

      <Pressable accessibilityRole="button" style={styles.signOut} onPress={() => router.push('/settings')}>
        <Text style={styles.signOutText}>{t('settings')}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  content: { padding: theme.space(3), paddingTop: theme.space(8), gap: theme.space(3) },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  name: { fontFamily: theme.font.body,
    fontSize: theme.size.title, fontWeight: '600', color: theme.color.ink },
  flame: { alignItems: 'center', paddingHorizontal: theme.space(1.5), paddingVertical: theme.space(1) },
  flameGlyph: { fontFamily: theme.font.body,
    fontSize: 24 },
  flameCount: { fontFamily: theme.font.body,
    fontSize: theme.size.label, fontWeight: '700', color: theme.color.flame },
  roundHeader: {
    borderLeftWidth: 3,
    borderLeftColor: theme.color.accent,
    paddingLeft: theme.space(2),
    gap: theme.space(0.5),
  },
  roundLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.inkMuted,
  },
  mainVerse: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.ink, fontStyle: 'italic' },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.lg,
    padding: theme.space(3),
    gap: theme.space(1),
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  cardEyebrow: {
    fontFamily: theme.font.body,
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.accent,
  },
  cardTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.title, fontWeight: '600', color: theme.color.ink },
  cardMeta: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  body: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.ink },
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
  queued: {
    textAlign: 'center',
    color: theme.color.inkMuted,
    fontFamily: theme.font.body,
    fontSize: theme.size.label,
    marginTop: theme.space(2),
  },
  signOut: { alignSelf: 'center', marginTop: theme.space(4), padding: theme.space(1) },
  signOutText: { color: theme.color.inkMuted },
})
