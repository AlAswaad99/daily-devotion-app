import { formatRef } from '@abide/content'
import { fromSqlTime, monthName, toEthiopic } from '@abide/domain'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DayScene } from '../../src/components/DayScene'
import { FlameButton } from '../../src/components/Flame'
import { Icon } from '../../src/components/Icon'
import { Mascot } from '../../src/components/Mascot'
import { InkCard, Kicker, RiseFade, Subtitle, UiText } from '../../src/components/ui'
import {
  contentCounts,
  getCompletion,
  getDayForDate,
  type LocalDay,
} from '../../src/data/repository'
import { useAudit } from '../../src/lib/audit'
import { WEEKDAYS, lineHeightFor, translate } from '../../src/lib/i18n'
import { log } from '../../src/lib/log'
import { getPreferences } from '../../src/lib/notifications'
import { useProfile } from '../../src/lib/profile'
import { useSession } from '../../src/lib/session'
import { fonts, theme } from '../../src/lib/theme'
import {
  greetingFor,
  hasBegunToday,
  heroPartOfDay,
  heroTextIsDark,
  markBegunToday,
  motivationFor,
  reminderArrived,
  streakState,
} from '../../src/lib/v3-logic'

/**
 * Today: a sky, a character, and one thing to read.
 *
 * Everything here is absolutely positioned against the design's own frame rather than
 * stacked in a column, because that is how the design is built and because the three
 * anchors it uses — the top chrome, the mascot's zone, the card above the nav — each
 * belong to a different edge. A column would have to guess at the gaps between them.
 *
 * The screen is a `View` with a small scroll layer for the states that carry a message
 * (nothing synced, no content, round finished). Those are rare and none of them coexist
 * with the devotion card, so nothing overlaps.
 */
export default function Today() {
  const { session, loading: sessionLoading } = useSession()
  const {
    profile,
    streak,
    today,
    loading: profileLoading,
    language,
    sync,
    queued,
  } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const audit = useAudit()

  const [day, setDay] = useState<LocalDay | null>(null)
  const [cached, setCached] = useState<{ days: number; books: number; rounds: number } | null>(
    null,
  )
  const [complete, setComplete] = useState(false)
  const [begun, setBegun] = useState(false)
  const [remindersOn, setRemindersOn] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
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
    setBegun(await hasBegunToday(today))
    setLoading(false)
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  // The arrival signal is only honest if reminders are actually on.
  useEffect(() => {
    void getPreferences().then((prefs) => {
      const values = Object.values(prefs)
      setRemindersOn(values.length === 0 || values.some(Boolean))
    })
  }, [])

  // Coming back from the reader must refresh the card, the flame and `begunToday`.
  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  /*
   * "Coming soon" ordinarily means the round really has ended — but it is exactly
   * the state a delta sync's cursor cannot tell apart from "something changed that
   * this device's cursor missed" (a book/round re-published after already being
   * live, for instance). A device already holding content only ever delta-syncs
   * from here on, so without this it can stay stuck on a stale "ended" reading
   * forever, no matter how many times someone pulls to refresh — indistinguishable,
   * from the outside, from the app being broken. One unconditional full pull, tried
   * once per app session, tells the two apart the same way a fresh install would.
   */
  const comingSoon = !loading && !day && (cached?.days ?? 0) > 0
  const healedComingSoon = useRef(false)
  useEffect(() => {
    if (!comingSoon || healedComingSoon.current) return
    healedComingSoon.current = true
    log.info('today', 'coming-soon despite cached content; forcing one full resync')
    void sync({ force: true, full: true }).then(load)
  }, [comingSoon, sync, load])

  if (sessionLoading || profileLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  if (!session) return <Redirect href="/welcome" />
  if (!profile) return <Redirect href="/onboarding" />

  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) =>
    translate(key, language, vars)
  const f = fonts(language)

  const part = audit.sky ?? heroPartOfDay()
  const dark = heroTextIsDark(part)
  const hero = dark ? '#f4f2e2' : '#3a230d'
  const state = streakState(streak)
  const name = profile.display_name.trim()
  /* Stable for the day: the greeting must not change while the screen is open. */
  const seed = today ?? 'no-date'

  const start = profile.reminder_at ? fromSqlTime(profile.reminder_at) : 6 * 60
  const duration = profile.reminder_duration_min || 30
  const arrived = reminderArrived({
    remindersOn,
    start,
    duration,
    begunToday: begun || complete,
    streak: state,
  })

  const title = language === 'am' ? day?.topic_am : day?.topic_en
  const bookTitle = language === 'am' ? day?.book_title_am : day?.book_title_en

  const open = () => {
    if (!day) return
    void markBegunToday(today)
    setBegun(true)
    router.push(`/day/${day.id}`)
  }

  /* The states that replace the devotion card, each a message rather than a study. */
  const notice =
    !loading && !today
      ? { kicker: t('notSyncedYet'), body: t('notSyncedYetBody'), retry: true }
      : !loading && !day && cached?.days === 0
        ? { kicker: t('noContentYet'), body: t('noContentYetBody'), retry: true }
        : comingSoon
          ? { kicker: t('comingSoon'), body: t('comingSoonBody'), retry: false }
          : null

  return (
    <View style={styles.screen}>
      <DayScene part={part} />
      {/* The wash that keeps the chrome legible at the top and the card at the bottom. */}
      <LinearGradient
        colors={['rgba(0,0,0,.14)', 'transparent', 'transparent', 'rgba(6,10,0,.5)']}
        locations={[0, 0.26, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('streakLabel')}: ${streak?.current ?? 0}`}
        style={[styles.flame, { top: insets.top + 0 }]}
        onPress={() => router.push('/streak')}
      >
        <FlameButton state={state} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings')}
        style={[styles.gear, { top: insets.top + 10 }]}
        onPress={() => router.push('/settings')}
      >
        <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.gearFill} />
        <Icon name="gear" size={17} colour="#dfe9c4" />
      </Pressable>

      <View style={[styles.greeting, { top: insets.top + 93 }]} pointerEvents="none">
        <Kicker
          language={language}
          size={13}
          tracking={theme.tracking.kickerWide}
          colour={hero}
          style={styles.greetingKicker}
        >
          {greetingFor(part, language, seed)}
          {name.length > 0 ? `${language === 'am' ? '፣ ' : ', '}${name}` : ''}
        </Kicker>
        {today !== null && (
          /*
           * Weekday and month, as the design draws it — but on the Ethiopian calendar,
           * which is the one this app displays everywhere else. The design's own line
           * reads "FRIDAY · SEP 2026"; ours reads "FRIDAY · NEHASE 2018", which is the
           * same sentence in the calendar the member keeps.
           */
          <Text style={[styles.date, { fontFamily: f.uiMedium, color: hero }]}>
            {WEEKDAYS[language][new Date(`${today}T00:00:00`).getDay()]} ·{' '}
            {monthName(toEthiopic(today).month, language).toUpperCase()} {toEthiopic(today).day}{' '}
            {toEthiopic(today).year}
          </Text>
        )}
        <Text
          style={[
            styles.motivation,
            { fontFamily: f.italic, color: hero, lineHeight: lineHeightFor(language, 14.5) },
          ]}
        >
          {motivationFor(language, seed)}
        </Text>
      </View>

      <View
        style={[styles.mascotZone, { top: insets.top + 148, bottom: insets.bottom + 262 }]}
        pointerEvents="box-none"
      >
        <Mascot
          size={150}
          playful
          lantern={arrived}
          mood={
            state === 'out'
              ? 'sad'
              : complete
                ? 'pleased'
                : state === 'low'
                  ? 'waiting'
                  : 'idle'
          }
        />
      </View>

      <View style={[styles.cardSlot, { bottom: insets.bottom + 118 }]}>
        {day && !notice && (
          <RiseFade duration={500}>
            <Pressable accessibilityRole="button" onPress={open}>
              <InkCard style={styles.card}>
                <View style={styles.cardHead}>
                  <View style={styles.cardIcon}>
                    <Icon name="devotionLeaf" size={24} colour={theme.color.accentBright} />
                  </View>
                  <View style={styles.cardText}>
                    <Kicker language={language} size={9} colour={theme.color.onInkDim}>
                      {complete ? t('alreadyDone') : t('todaysDevotion')}
                    </Kicker>
                    <Subtitle
                      language={language}
                      size={22}
                      colour={theme.color.onInkBright}
                      numberOfLines={2}
                      style={styles.cardTitle}
                    >
                      {title}
                    </Subtitle>
                    {/* The passage and how long it takes — what the design puts here. */}
                    <View style={styles.cardMeta}>
                      <UiText
                        language={language}
                        size={11.5}
                        colour={theme.color.onInkSecondary}
                        numberOfLines={1}
                        style={styles.cardRef}
                      >
                        {day.passage ? formatRef(day.passage, language) : bookTitle}
                      </UiText>
                      <View style={styles.dot} />
                      <UiText
                        language={language}
                        size={11.5}
                        colour={theme.color.onInkSecondary}
                      >
                        {t('minutesRead', {
                          n: Math.max(1, Math.round(day.expected_seconds / 60)),
                        })}
                      </UiText>
                    </View>
                  </View>
                </View>

                <View style={styles.cardCta}>
                  <LinearGradient
                    colors={theme.gradient.cta as unknown as [string, string, string]}
                    locations={theme.gradient.ctaStops as unknown as [number, number, number]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Text style={[styles.cardCtaText, { fontFamily: f.labelStrong }]}>
                    {complete ? t('completed') : t('beginStudy')}
                  </Text>
                  <Text style={[styles.cardCtaArrow, { fontFamily: f.labelStrong }]}>→</Text>
                </View>
              </InkCard>
            </Pressable>
          </RiseFade>
        )}

        {notice && (
          <RiseFade duration={500}>
            <InkCard style={styles.notice}>
              <Kicker language={language} size={9} colour={theme.color.onInkDim}>
                {notice.kicker}
              </Kicker>
              <Text
                style={[
                  styles.noticeBody,
                  { fontFamily: f.body, lineHeight: lineHeightFor(language, 15) },
                ]}
              >
                {notice.body}
              </Text>
              {notice.retry && (
                <Pressable
                  accessibilityRole="button"
                  style={styles.retry}
                  onPress={() => void sync({ force: true }).then(load)}
                >
                  <Text style={[styles.retryText, { fontFamily: f.label }]}>{t('retry')}</Text>
                </Pressable>
              )}
            </InkCard>
          </RiseFade>
        )}

        {queued > 0 && (
          <Text style={[styles.queued, { fontFamily: f.ui }]}>
            {t('waitingToSync', { count: queued })}
          </Text>
        )}
      </View>

      {/*
       * Pull-to-refresh, without a scrolling layout.
       *
       * Everything above is absolutely positioned, so there is nothing to scroll — but
       * the gesture is the one manual way to ask for a sync, and members use it. This
       * is an empty full-screen scroll view behind the content, which is why it does
       * not capture taps on anything above it.
       */}
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.refreshLayer}
        pointerEvents="box-none"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            tintColor={hero}
            onRefresh={async () => {
              await sync({ force: true })
              await load()
            }}
          />
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.inkDeeper },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  refreshLayer: { flex: 1 },

  flame: {
    position: 'absolute',
    left: 18,
    width: 56,
    height: 60,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    zIndex: 8,
  },
  gear: {
    position: 'absolute',
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.18)',
    zIndex: 8,
  },
  gearFill: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,16,5,.42)' },

  greeting: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  greetingKicker: { textAlign: 'center', opacity: 0.9 },
  date: { marginTop: 3, fontSize: 12, letterSpacing: 2, opacity: 0.65 },
  motivation: {
    marginTop: 11,
    fontSize: 14.5,
    opacity: 0.82,
    textAlign: 'center',
    paddingHorizontal: 48,
  },

  mascotZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },

  cardSlot: { position: 'absolute', left: 18, right: 18, gap: 9, zIndex: 4 },
  card: { padding: 15, paddingLeft: 17, gap: 11 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: theme.radius.tile,
    backgroundColor: 'rgba(169,200,106,.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { marginTop: 3 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  cardRef: { flexShrink: 1 },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.color.onInkDim },
  cardCta: {
    height: 46,
    borderRadius: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  cardCtaText: { fontSize: 14.5, letterSpacing: 0.4, color: theme.color.inkDeep },
  cardCtaArrow: { fontSize: 16, color: theme.color.inkDeep },

  notice: { padding: 17, gap: 8 },
  noticeBody: { fontSize: 15, color: theme.color.onInkSecondary },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(169,200,106,.16)',
  },
  retryText: { fontSize: 13, color: theme.color.accentBright },

  queued: {
    textAlign: 'center',
    fontSize: 11.5,
    color: theme.color.onInkDim,
  },
})
