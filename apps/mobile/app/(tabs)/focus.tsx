import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useProfile } from '../../src/lib/profile'
import { theme } from '../../src/lib/theme'
import { ProgressRing } from '../../src/components/ProgressRing'
import {
  endSession, listSessions, startSession, summary,
  type PrayerSession, type PrayerSummary,
} from '../../src/data/prayer'

/**
 * Focus — a bounded, intentional prayer session.
 *
 * Separate from study on purpose, and it never touches the streak. Prayer is tracked
 * and shown; scoring it would change what it is for, and a member who prays daily but
 * reads irregularly should not be handed a streak they have not kept.
 *
 * Leaving the app is recorded, not punished. The spec's words for what it should feel
 * like are "no punishment, just a mirror" — so an interrupted session still counts as
 * a session, and the count is stated plainly afterwards rather than scolded about.
 */

const PRESETS = [5, 10, 15, 20, 30]

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Focus() {
  const { t, language } = useProfile()

  const [minutes, setMinutes] = useState(10)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [interruptions, setInterruptions] = useState(0)
  const [finished, setFinished] = useState<{ seconds: number; interruptions: number } | null>(null)

  const [history, setHistory] = useState<PrayerSession[]>([])
  const [stats, setStats] = useState<PrayerSummary | null>(null)

  /*
   * The end time, not a countdown that ticks down.
   *
   * A per-second decrement drifts and, worse, stops entirely while the screen is off
   * — so a member who pockets the phone mid-prayer would come back to a timer that
   * had barely moved. Anchoring to a wall-clock deadline makes the display a
   * function of real time, which is what someone praying actually experiences.
   */
  const endsAt = useRef<number | null>(null)
  const running = sessionId !== null

  const refresh = useCallback(async () => {
    const [rows, s] = await Promise.all([listSessions(), summary()])
    setHistory(rows)
    setStats(s)
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  const stop = useCallback(
    async (completed: boolean) => {
      const id = sessionId
      if (!id) return
      const total = minutes * 60
      const left = endsAt.current ? Math.max(0, (endsAt.current - Date.now()) / 1000) : 0
      const elapsed = completed ? total : total - left

      setSessionId(null)
      endsAt.current = null
      setFinished({ seconds: elapsed, interruptions })

      await endSession(id, elapsed, completed, interruptions)
      await refresh()
    },
    [sessionId, minutes, interruptions, refresh],
  )

  // The clock. A second is plenty; nothing here is animated frame by frame.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const left = endsAt.current ? (endsAt.current - Date.now()) / 1000 : 0
      setRemaining(Math.max(0, left))
      if (left <= 0) void stop(true)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [running, stop])

  /*
   * Leave-detection.
   *
   * This is the whole of what the spec promises on both platforms, and it is
   * deliberately modest: the app can tell it stopped being in front of you. It cannot
   * tell whether you took a call, checked a message, or put the phone down to kneel.
   * So it counts, and says how many times, and draws no conclusion.
   */
  useEffect(() => {
    if (!running) return
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') setInterruptions((n) => n + 1)
    })
    return () => sub.remove()
  }, [running])

  const begin = async () => {
    setFinished(null)
    setInterruptions(0)
    endsAt.current = Date.now() + minutes * 60 * 1000
    setRemaining(minutes * 60)
    setSessionId(await startSession())
  }

  const progress = running ? 1 - remaining / (minutes * 60) : 0

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {!running && (
        <View style={styles.head}>
          <Text style={styles.title}>{t('focusTab')}</Text>
          <Text style={styles.sub}>{t('focusIntro')}</Text>
        </View>
      )}

      <ProgressRing progress={progress}>
        <Text style={styles.clock}>{mmss(running ? remaining : minutes * 60)}</Text>
        {running && interruptions > 0 && (
          <Text style={styles.awayNow}>
            {t('focusSteppedAway')} {interruptions}
          </Text>
        )}
      </ProgressRing>

      {!running && (
        <View style={styles.presets}>
          {PRESETS.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMinutes(m)}
              style={[styles.preset, m === minutes && styles.presetOn]}
            >
              <Text style={[styles.presetText, m === minutes && styles.presetTextOn]}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable
        style={[styles.primary, running && styles.primaryStop]}
        onPress={() => (running ? void stop(false) : void begin())}
      >
        <Text style={styles.primaryText}>{running ? t('focusEnd') : t('focusBegin')}</Text>
      </Pressable>

      {/*
        Said once, afterwards, without judgement. "You stepped away twice" is a
        mirror; "you failed to focus" would be a scold, and this is prayer.
      */}
      {finished && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {t('focusDone')} · {mmss(finished.seconds)}
          </Text>
          <Text style={styles.cardBody}>
            {finished.interruptions === 0
              ? t('focusUninterrupted')
              : `${t('focusSteppedAway')} ${finished.interruptions}`}
          </Text>
        </View>
      )}

      {!running && stats && stats.sessions > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('focusLast30')}</Text>
          <Text style={styles.cardBody}>
            {stats.sessions} · {stats.minutes} {t('focusMinutes')}
          </Text>
        </View>
      )}

      {!running && history.length > 0 && (
        <View style={styles.history}>
          {history.slice(0, 10).map((h) => (
            <View key={h.id} style={styles.row}>
              <Text style={styles.rowWhen}>
                {new Date(h.started_at).toLocaleDateString(language === 'am' ? 'am-ET' : 'en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}
              </Text>
              <Text style={styles.rowMain}>{mmss(h.duration_seconds)}</Text>
              <Text style={styles.rowNote}>
                {h.interruptions > 0 ? `· ${h.interruptions}` : h.completed ? '·' : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: {
    padding: theme.space(3),
    gap: theme.space(3),
    alignItems: 'center',
    backgroundColor: theme.color.bg,
    flexGrow: 1,
  },
  head: { alignItems: 'center', gap: theme.space(1) },
  title: { fontSize: theme.size.display, color: theme.color.ink },
  sub: {
    fontSize: theme.size.body,
    color: theme.color.inkMuted,
    textAlign: 'center',
    maxWidth: 300,
  },
  clock: { fontSize: 52, color: theme.color.ink, fontVariant: ['tabular-nums'] },
  awayNow: { fontSize: theme.size.micro, color: theme.color.inkMuted, marginTop: 4 },

  presets: { flexDirection: 'row', gap: theme.space(1) },
  preset: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.color.surface,
  },
  presetOn: { backgroundColor: theme.color.accent },
  presetText: { fontSize: theme.size.body, color: theme.color.ink },
  presetTextOn: { color: '#fff' },

  primary: {
    backgroundColor: theme.color.accent,
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(5),
    borderRadius: theme.radius.pill,
  },
  primaryStop: { backgroundColor: theme.color.surface },
  primaryText: { fontSize: theme.size.body, color: '#fff' },

  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space(2),
    alignItems: 'center',
    gap: 4,
    alignSelf: 'stretch',
  },
  cardTitle: { fontSize: theme.size.body, color: theme.color.ink },
  cardBody: { fontSize: theme.size.label, color: theme.color.inkMuted },

  history: { alignSelf: 'stretch', gap: theme.space(1) },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1.5) },
  rowWhen: { fontSize: theme.size.label, color: theme.color.inkMuted, width: 70 },
  rowMain: { fontSize: theme.size.body, color: theme.color.ink },
  rowNote: { fontSize: theme.size.label, color: theme.color.inkMuted },
})
