import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { formatRef } from '@abide/content'
import { meetsCompletionBar, requiredSeconds } from '@abide/domain'
import { useProfile } from '../../src/lib/profile'
import {
  completeDay, getCompletion, getDay, getReflections, getSummaryQuestions, isFavourite,
  saveReflection, toggleFavourite, type LocalDay,
} from '../../src/data/repository'
import { PaperBackdrop } from '../../src/components/Backdrop'
import { Icon } from '../../src/components/Icon'
import { KeyVerseCard } from '../../src/components/KeyVerseCard'
import { PrimaryButton } from '../../src/components/PrimaryButton'
import { ReflectionField } from '../../src/components/ReflectionField'
import { SummaryQuestions } from '../../src/components/SummaryQuestions'
import { BackButton, Body, Kicker, PaperCard, Title } from '../../src/components/ui'
import { WEEKDAYS, lineHeightFor, translate } from '../../src/lib/i18n'
import { fonts, theme } from '../../src/lib/theme'
import { log } from '../../src/lib/log'

interface SummaryQuestion {
  ordinal: number
  question_en: string
  question_am: string
}

/** Reading time is checkpointed so progress survives an app kill. */
const CHECKPOINT_MS = 10_000
const progressKey = (dayId: string) => `abide.reading.${dayId}`

/**
 * A devotion, read.
 *
 * The design's page in order: a header that stays put, the reference, the title, the
 * key verse on ink, a bar into the full chapter, the body, and one question with
 * somewhere to answer it. The app adds what the design has no data for — the prayer the
 * ministry wrote, the cross-references it cited, and the Done control that records the
 * completion — each in the design's own vocabulary rather than in the old one.
 */
export default function DevotionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { profile, language, t, today, refresh } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [day, setDay] = useState<LocalDay | null>(null)
  const [questions, setQuestions] = useState<SummaryQuestion[]>([])
  const [completedMethod, setCompletedMethod] = useState<string | null>(null)
  const [reflections, setReflections] = useState<Record<number, string>>({})
  const [favourite, setFavourite] = useState(false)
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
      const row = await getDay(id)
      if (cancelled) return
      setDay(row)

      if (row?.kind === 'summary') {
        const qs = await getSummaryQuestions(row.book_id)
        if (!cancelled) setQuestions(qs)
      }

      const [done, written, starred] = await Promise.all([
        getCompletion(id),
        getReflections(id),
        isFavourite(id),
      ])
      if (!cancelled) {
        setCompletedMethod(done?.method ?? null)
        setReflections(Object.fromEntries(written.map((r) => [r.question_ordinal, r.body])))
        setFavourite(starred)
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

      try {
        // Local write, queued for the server. Never blocks on the network: a
        // devotion read in airplane mode is finished the moment Done is tapped.
        await completeDay({
          id: day.id,
          scheduledDate: day.scheduled_date,
          readingSeconds: seconds,
          scrollDepth: scrollDepth,
          confirmedEarly,
        })
        await AsyncStorage.removeItem(progressKey(day.id))
        await refresh()
        /*
         * A summary is the last thing in a series, so finishing one ends the series
         * rather than returning to it. `replace` because the reader is not somewhere
         * to come back to from the celebration.
         */
        if (day.kind === 'summary') router.replace(`/series/${day.book_id}/complete`)
        else router.back()
      } catch (e) {
        log.error('devotion', 'could not record completion', e)
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSaving(false)
      }
    },
    [day, seconds, scrollDepth, refresh, router],
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

    Alert.alert(t('finishedAlready'), t('finishedAlreadyBody', { seconds }), [
      { text: t('keepReading'), style: 'cancel' },
      { text: t('markDone'), onPress: () => void submit(true) },
    ])
  }, [day, scrollDepth, seconds, submit, t])

  if (loading) {
    return (
      <View style={styles.centered}>
        <PaperBackdrop />
        <ActivityIndicator color={theme.color.accent} />
      </View>
    )
  }
  if (!day) {
    return (
      <View style={styles.centered}>
        <PaperBackdrop />
        <Text style={styles.error}>{error ?? t('noDevotionToday')}</Text>
      </View>
    )
  }

  const f = fonts(language)
  const pick = (en: string, am: string) => (language === 'am' ? am : en)
  const isBackfill = today !== null && day.scheduled_date < today
  const remaining = Math.max(0, Math.ceil(requiredSeconds(day.expected_seconds) - seconds))
  const isSummary = day.kind === 'summary'
  const readerLanguage = profile?.reader_language ?? language
  const keyVerse = day.key_verses[0] ?? null

  /*
   * The kicker names where you are in the series — or, for today's reading, what day it
   * is. Both are the design's; it draws "JOHN · PART 2" on an older day and
   * "FRIDAY READING" on the current one.
   */
  const weekday = WEEKDAYS[language][new Date(`${day.scheduled_date}T00:00:00`).getDay()]
  const kicker = isSummary
    ? translate('summaryKicker', language)
    : day.scheduled_date === today
      ? `${weekday} · ${translate('readingWord', language)}`
      : `${(pick(day.book_title_en ?? '', day.book_title_am ?? '')).toUpperCase()} · ${translate('partWord', language, { n: day.day_number })}`

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 40 },
        ]}
        onScroll={onScroll}
        scrollEventThrottle={64}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} label={t('back')} />
          <Kicker language={language} style={styles.headerKicker}>
            {kicker}
          </Kicker>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={favourite ? t('readerUnbookmark') : t('readerBookmark')}
            hitSlop={8}
            style={styles.star}
            onPress={() => void toggleFavourite(day.id).then(setFavourite)}
          >
            <Text style={[styles.starGlyph, favourite && styles.starOn]}>
              {favourite ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.body}>
          {/*
            * The summary gets its own header rather than the reader's: no reference
            * (a summary is not about one passage), no part/duration meta — just the
            * series name as the title and the design's own lede underneath it.
            */}
          {!isSummary && day.passage && (
            <Text style={[styles.ref, { fontFamily: f.labelStrong }]}>
              {formatRef(day.passage, language)}
            </Text>
          )}

          <Title language={language} size={isSummary ? 36 : 40} accessibilityRole="header" style={styles.title}>
            {isSummary
              ? pick(day.book_title_en ?? '', day.book_title_am ?? '')
              : pick(day.topic_en, day.topic_am)}
          </Title>

          {isSummary ? (
            <Body
              language={language}
              size={15.5}
              colour={theme.color.inkSecondary}
              style={styles.lede}
            >
              {t('summaryLede')}
            </Body>
          ) : (
            <Text style={[styles.meta, { fontFamily: f.uiMedium }]}>
              {[
                pick(day.book_title_en ?? '', day.book_title_am ?? ''),
                translate('partWord', language, { n: day.day_number }),
                translate('minutesRead', language, {
                  n: Math.max(1, Math.round(day.expected_seconds / 60)),
                }),
                isBackfill ? t('backfilled') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}

          {day.kind === 'devotion' && (
            <>
              {keyVerse && (
                <View style={styles.verseBlock}>
                  <KeyVerseCard
                    reference={keyVerse}
                    language={language}
                    readerLanguage={readerLanguage}
                  />
                </View>
              )}

              {/* The way into the chapter the devotion is about. */}
              {day.passage && (
                <Pressable
                  accessibilityRole="button"
                  style={[styles.bibleBar, keyVerse ? styles.bibleBarSeamed : styles.bibleBarAlone]}
                  onPress={() =>
                    router.push({
                      pathname: '/(tabs)/bible',
                      params: {
                        book: String(day.passage!.book),
                        chapter: String(day.passage!.chapter),
                      },
                    })
                  }
                >
                  <Icon name="bible" size={15} colour={theme.color.accentBright} />
                  <Text style={[styles.bibleLabel, { fontFamily: f.label }]}>
                    {t('readFullChapter')}
                  </Text>
                  <View style={styles.bibleArrow}>
                    <Text style={styles.bibleArrowGlyph}>→</Text>
                  </View>
                </Pressable>
              )}

              <View style={styles.paragraphs}>
                <Body language={language} size={17.5} colour={theme.color.inkBody}>
                  {pick(day.purpose_en, day.purpose_am)}
                </Body>

                {pick(day.prayer_en, day.prayer_am).trim().length > 0 && (
                  <View style={styles.prayer}>
                    <Kicker language={language} style={styles.prayerKicker}>
                      {t('prayer')}
                    </Kicker>
                    <Body language={language} size={17.5} colour={theme.color.inkBody}>
                      {pick(day.prayer_en, day.prayer_am)}
                    </Body>
                  </View>
                )}
              </View>

              {day.cross_refs.length > 0 && (
                <View style={styles.crossRefs}>
                  <Kicker language={language}>{t('crossReferences')}</Kicker>
                  <View style={styles.refRow}>
                    {day.cross_refs.map((ref, i) => (
                      /*
                       * The reference travels as numbers rather than as its printed
                       * form: the reader resolves a canonical book index, and
                       * re-parsing a string we already parsed at import would be a
                       * second chance to disagree with ourselves.
                       */
                      <Pressable
                        accessibilityRole="button"
                        key={i}
                        style={styles.refChip}
                        onPress={() =>
                          router.push({
                            pathname: '/(tabs)/bible',
                            params: {
                              book: String(ref.book),
                              chapter: String(ref.chapter),
                              ...(ref.verseStart ? { verse: String(ref.verseStart) } : {}),
                            },
                          })
                        }
                      >
                        <Text style={[styles.refChipText, { fontFamily: f.label }]}>
                          {formatRef(ref, language)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}

              <Kicker language={language} style={styles.reflectKicker}>
                {t('reflectLabel')}
              </Kicker>
              <PaperCard style={styles.reflectCard} lift="none">
                <Body language={language} size={17} colour={theme.color.inkBody}>
                  {t('genericReflectQ')}
                </Body>
                <ReflectionField
                  showSave
                  saveLabel={
                    (reflections[0] ?? '').length > 0
                      ? t('updateReflectionBtn')
                      : t('saveReflectionBtn')
                  }
                  value={reflections[0] ?? ''}
                  onSave={(text) => {
                    setReflections((r) => ({ ...r, 0: text }))
                    return saveReflection(day.id, 0, text)
                  }}
                />
              </PaperCard>
            </>
          )}

          {isSummary && (
            <View style={styles.summary}>
              <SummaryQuestions
                questions={questions}
                answers={reflections}
                language={language}
                onAnswer={(ordinal, text) => {
                  setReflections((r) => ({ ...r, [ordinal]: text }))
                  return saveReflection(day.id, ordinal, text)
                }}
              />
            </View>
          )}

          {error !== null && <Text style={styles.error}>{error}</Text>}

          <View style={styles.footer}>
            {completedMethod ? (
              <Pressable
                accessibilityRole="button"
                /* Only the summary has somewhere to go; elsewhere this stays a label. */
                disabled={!isSummary}
                style={styles.doneAlready}
                onPress={() => router.replace(`/series/${day.book_id}/complete`)}
              >
                <Text style={[styles.doneAlreadyText, { fontFamily: f.label }]}>
                  ✓ {completedMethod === 'repair' ? t('repaired') : t('completed')}
                </Text>
              </Pressable>
            ) : (
              <PrimaryButton
                language={language}
                label={isSummary ? t('finishSeries') : t('done')}
                arrow={isSummary}
                glow={false}
                busy={saving}
                onPress={onDone}
              />
            )}
            {/*
              * How much reading is still expected. Not a gate — Done is always tappable
              * — but saying it is kinder than an alert that arrives without warning.
              */}
            {!completedMethod && remaining > 0 && (
              <Text style={[styles.hint, { fontFamily: f.ui }]}>{remaining}s</Text>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 130 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 22,
    paddingBottom: 12,
  },
  headerKicker: { flex: 1 },
  star: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlyph: { fontSize: 17, lineHeight: 20, color: theme.color.inkMuted },
  starOn: { color: theme.color.flame },

  body: { paddingHorizontal: 26, paddingTop: 4 },
  ref: {
    fontSize: 11.5,
    letterSpacing: 2.5,
    color: theme.color.accent,
  },
  title: { marginTop: 7 },
  meta: { marginTop: 8, fontSize: 12, color: theme.color.inkMuted },
  lede: { marginTop: 8 },

  verseBlock: { marginTop: 22 },
  bibleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 16,
    backgroundColor: theme.color.inkBar,
    ...theme.shadow.card,
  },
  /* Seamed to the verse card above: square at the top, round at the bottom. */
  bibleBarSeamed: {
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  bibleBarAlone: { borderRadius: 22, marginTop: 22 },
  bibleLabel: { flex: 1, fontSize: 13.5, color: theme.color.accentOnInk },
  bibleArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(169,200,106,.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bibleArrowGlyph: { fontSize: 14, lineHeight: 16, color: theme.color.accentBright },

  paragraphs: { marginTop: 26, gap: 14 },
  prayer: { gap: 6 },
  prayerKicker: { marginTop: 8 },

  crossRefs: { marginTop: 26, gap: 10 },
  refRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  refChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pillSoft,
    backgroundColor: 'rgba(94,126,51,.13)',
  },
  refChipText: { fontSize: 12, color: theme.color.accentDeep },

  reflectKicker: { marginTop: 30 },
  reflectCard: {
    marginTop: 10,
    paddingVertical: 18,
    paddingHorizontal: 20,
    gap: 14,
  },

  summary: { marginTop: 22 },

  footer: { marginTop: 30, gap: 10 },
  doneAlready: {
    height: theme.layout.ctaHeight,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(94,126,51,.13)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneAlreadyText: { fontSize: 14.5, color: theme.color.accentDeep },
  hint: { textAlign: 'center', fontSize: 11.5, color: theme.color.inkMuted },
  error: { marginTop: 16, color: theme.color.danger, textAlign: 'center' },
})
