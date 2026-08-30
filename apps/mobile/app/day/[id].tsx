import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, AppState, Alert, Pressable, ScrollView, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { formatRef } from '@abide/content'
import { meetsCompletionBar, requiredSeconds, type ScriptureRef } from '@abide/domain'
import { supabase } from '../../src/lib/supabase'
import { useProfile } from '../../src/lib/profile'
import { theme } from '../../src/lib/theme'
import { lineHeightFor } from '../../src/lib/i18n'
import { log } from '../../src/lib/log'
import { formatEthiopic } from '@abide/domain'

interface DayRow {
  id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  topic_am: string
  purpose_en: string
  purpose_am: string
  prayer_en: string
  prayer_am: string
  passage: ScriptureRef | null
  key_verses: ScriptureRef[]
  cross_refs: ScriptureRef[]
  expected_seconds: number
  scheduled_date: string
  book_id: string
}

interface SummaryQuestion {
  ordinal: number
  question_en: string
  question_am: string
}

/** Reading time is checkpointed so progress survives an app kill. */
const CHECKPOINT_MS = 10_000
const progressKey = (dayId: string) => `abide.reading.${dayId}`

export default function DevotionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { language, t, today, refresh, setStreak } = useProfile()
  const router = useRouter()

  const [day, setDay] = useState<DayRow | null>(null)
  const [questions, setQuestions] = useState<SummaryQuestion[]>([])
  const [completedMethod, setCompletedMethod] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [scrollDepth, setScrollDepth] = useState(0)
  const [seconds, setSeconds] = useState(0)
  /** Foregrounded seconds only — the timer pauses on background and resumes. */
  const foregrounded = useRef(true)

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      foregrounded.current = state === 'active'
    })
    const tick = setInterval(() => {
      if (foregrounded.current) setSeconds((s) => s + 1)
    }, 1000)
    return () => {
      sub.remove()
      clearInterval(tick)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase
        .from('devotion_days')
        .select(
          'id, day_number, kind, topic_en, topic_am, purpose_en, purpose_am, prayer_en,' +
            ' prayer_am, passage, key_verses, cross_refs, expected_seconds, scheduled_date, book_id',
        )
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      const row = data as unknown as DayRow | null
      setDay(row)

      if (row?.kind === 'summary') {
        const { data: qs } = await supabase
          .from('summary_questions')
          .select('ordinal, question_en, question_am')
          .eq('book_id', row.book_id)
          .order('ordinal')
        if (!cancelled) setQuestions((qs as SummaryQuestion[] | null) ?? [])
      }

      const { data: done } = await supabase
        .from('day_completions')
        .select('method')
        .eq('devotion_day_id', id)
        .maybeSingle()
      if (!cancelled) {
        setCompletedMethod((done as { method: string } | null)?.method ?? null)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  // Reading time is checkpointed locally every 10s, so closing the app halfway
  // through a devotion does not reset the progress toward the completion bar.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void AsyncStorage.getItem(progressKey(id)).then((stored) => {
      if (!cancelled && stored) setSeconds((s) => Math.max(s, Number(stored) || 0))
    })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    if (!id || completedMethod) return
    const timer = setInterval(() => {
      void AsyncStorage.setItem(progressKey(id), String(seconds))
    }, CHECKPOINT_MS)
    return () => clearInterval(timer)
  }, [id, seconds, completedMethod])

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    const reachable = Math.max(contentSize.height - layoutMeasurement.height, 1)
    const depth = Math.min(1, Math.max(0, contentOffset.y / reachable))
    setScrollDepth((current) => Math.max(current, depth))
  }, [])

  const submit = useCallback(
    async (confirmedEarly: boolean) => {
      if (!day) return
      setSaving(true)
      setError(null)

      log.info('devotion', 'completing day', {
        day: day.id,
        seconds,
        scrollDepth: Number(scrollDepth.toFixed(2)),
        expectedSeconds: day.expected_seconds,
        confirmedEarly,
      })
      const { data, error } = await supabase.rpc('complete_day', {
        p_day: day.id,
        p_reading_seconds: seconds,
        p_scroll_depth: scrollDepth,
        p_confirmed_early: confirmedEarly,
      })
      log.result('devotion', 'complete_day', { data, error })

      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }

      // The server's answer is the one that counts; adopt it rather than guessing.
      if (data) setStreak(data as never)
      await AsyncStorage.removeItem(progressKey(day.id))
      await refresh()
      router.back()
    },
    [day, seconds, scrollDepth, refresh, router, setStreak],
  )

  const onDone = useCallback(() => {
    if (!day) return
    const met = meetsCompletionBar({
      scrollDepth,
      foregroundSeconds: seconds,
      expectedSeconds: day.expected_seconds,
    })

    // Done is always tappable. If the bar is not met we ask once, and record it —
    // the flag is analytics signal, never a penalty.
    if (met) {
      void submit(false)
      return
    }

    Alert.alert(
      t('finishedAlready'),
      t('finishedAlreadyBody', { seconds }),
      [
        { text: t('keepReading'), style: 'cancel' },
        { text: t('markDone'), onPress: () => void submit(true) },
      ],
    )
  }, [day, scrollDepth, seconds, submit, t])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }
  if (!day) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? t('noDevotionToday')}</Text>
      </View>
    )
  }

  const pick = (en: string, am: string) => (language === 'am' ? am : en)
  const bodyLine = { lineHeight: lineHeightFor(language, theme.size.body) }
  const isBackfill = today !== null && day.scheduled_date < today
  const remaining = Math.max(0, Math.ceil(requiredSeconds(day.expected_seconds) - seconds))

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={64}
      >
        <Text style={styles.eyebrow}>
          {formatEthiopic(day.scheduled_date, language)}
          {isBackfill ? ` · ${t('backfilled')}` : ''}
        </Text>
        <Text style={styles.title}>{pick(day.topic_en, day.topic_am)}</Text>

        {day.passage && (
          <Text style={styles.passage}>{formatRef(day.passage, language)}</Text>
        )}

        {day.kind === 'devotion' && (
          <>
            <Text style={[styles.body, bodyLine]}>{pick(day.purpose_en, day.purpose_am)}</Text>

            {day.key_verses.length > 0 && (
              <View style={styles.keyCard}>
                <Text style={styles.cardLabel}>{t('keyVerses')}</Text>
                {day.key_verses.map((ref, i) => (
                  <Text key={i} style={styles.refText}>
                    {formatRef(ref, language)}
                  </Text>
                ))}
              </View>
            )}

            {/* The prayer sits below the body and is warmer than the key-verse card. */}
            {pick(day.prayer_en, day.prayer_am).trim().length > 0 && (
              <View style={styles.prayerCard}>
                <Text style={styles.cardLabel}>{t('prayer')}</Text>
                <Text style={[styles.body, bodyLine]}>{pick(day.prayer_en, day.prayer_am)}</Text>
              </View>
            )}

            {day.cross_refs.length > 0 && (
              <View style={styles.crossRefs}>
                <Text style={styles.cardLabel}>{t('crossReferences')}</Text>
                <View style={styles.refRow}>
                  {day.cross_refs.map((ref, i) => (
                    // Tappable in Phase 7, when there is a reader to open.
                    <View key={i} style={styles.refChip}>
                      <Text style={styles.refChipText}>{formatRef(ref, language)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {day.kind === 'summary' && (
          <View style={{ gap: theme.space(2) }}>
            <Text style={styles.cardLabel}>{t('summaryQuestions')}</Text>
            {questions.map((q) => (
              <View key={q.ordinal} style={styles.keyCard}>
                <Text style={[styles.body, bodyLine]}>
                  {q.ordinal}. {pick(q.question_en, q.question_am)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: theme.space(12) }} />
      </ScrollView>

      <View style={styles.footer}>
        {completedMethod ? (
          <View style={[styles.doneButton, styles.doneAlready]}>
            <Text style={styles.doneAlreadyText}>
              ✓ {completedMethod === 'repair' ? t('repaired') : t('completed')}
            </Text>
          </View>
        ) : (
          <Pressable style={styles.doneButton} onPress={onDone} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={theme.color.surface} />
            ) : (
              <Text style={styles.doneText}>{t('done')}</Text>
            )}
          </Pressable>
        )}
        {!completedMethod && remaining > 0 && (
          <Text style={styles.footerHint}>{remaining}s</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.space(3), paddingTop: theme.space(8), gap: theme.space(2) },
  eyebrow: {
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.inkMuted,
  },
  title: { fontSize: theme.size.display, fontWeight: '700', color: theme.color.ink },
  passage: { fontSize: theme.size.label, color: theme.color.accent, fontWeight: '600' },
  body: { fontSize: theme.size.body, color: theme.color.ink },
  cardLabel: {
    fontSize: theme.size.micro,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: theme.color.inkMuted,
  },
  keyCard: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2),
    gap: theme.space(0.5),
  },
  prayerCard: {
    backgroundColor: theme.color.prayer,
    borderRadius: theme.radius.md,
    padding: theme.space(2),
    gap: theme.space(1),
  },
  crossRefs: { gap: theme.space(1) },
  refRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) },
  refText: { fontSize: theme.size.body, color: theme.color.ink },
  refChip: {
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(0.75),
    paddingHorizontal: theme.space(1.5),
  },
  refChipText: { fontSize: theme.size.label, color: theme.color.accent },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.space(3),
    paddingBottom: theme.space(5),
    backgroundColor: theme.color.bg,
    borderTopWidth: 1,
    borderTopColor: theme.color.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
  },
  doneButton: {
    flex: 1,
    backgroundColor: theme.color.ink,
    borderRadius: theme.radius.pill,
    paddingVertical: theme.space(2),
    alignItems: 'center',
  },
  doneText: { color: theme.color.surface, fontSize: theme.size.body, fontWeight: '700' },
  doneAlready: { backgroundColor: theme.color.accentSoft },
  doneAlreadyText: { color: theme.color.accent, fontWeight: '700' },
  footerHint: { color: theme.color.inkMuted, fontSize: theme.size.label },
  error: { color: theme.color.danger },
})
