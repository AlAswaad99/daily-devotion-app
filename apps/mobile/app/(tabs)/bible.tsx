import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BOOKS } from '@abide/content'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProfile } from '../../src/lib/profile'
import { useNavVisibility } from '../../src/lib/nav-visibility'
import { PaperBackdrop } from '../../src/components/Backdrop'
import { PrimaryButton } from '../../src/components/PrimaryButton'
import { Body, Kicker, Title } from '../../src/components/ui'
import { lineHeightFor } from '../../src/lib/i18n'
import { fonts, theme } from '../../src/lib/theme'
import {
  bookName, chapterCount, chapterVerses, openExternally, searchVerses,
  translationFor, type SearchHit, type Translation, type Verse,
} from '../../src/lib/scripture'
import {
  isBookmarked, listHighlights, setHighlight, readerFontScale, setReaderFontScale,
  toggleBookmark,
} from '../../src/data/reader'

/**
 * The reader.
 *
 * Reader language is deliberately independent of UI language: plenty of members
 * navigate an English interface and read scripture in Amharic, and the spec treats
 * these as two settings rather than one.
 *
 * When no text is bundled for that language the screen does not pretend to be
 * broken — it says the passage can be opened elsewhere and offers to do it. That is
 * the shipping path until Biblica grants permission, not a fallback for errors.
 */
export default function Bible() {
  const { profile, language, t } = useProfile()
  const readerLanguage = profile?.reader_language ?? language
  const insets = useSafeAreaInsets()
  const { setHidden } = useNavVisibility()

  // Set when a cross-reference chip in a devotion opens the reader at a passage.
  const params = useLocalSearchParams<{ book?: string; chapter?: string; verse?: string }>()

  const [translation, setTranslation] = useState<Translation | null>(null)
  const [loading, setLoading] = useState(true)
  const [book, setBook] = useState(43)
  const [chapter, setChapter] = useState(1)
  const [chapters, setChapters] = useState(0)
  const [verses, setVerses] = useState<Verse[]>([])
  const [highlights, setHighlights] = useState<Set<number>>(new Set())
  const [bookmarked, setBookmarked] = useState(false)
  const [scale, setScale] = useState(1)
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [target, setTarget] = useState<number | null>(null)

  /*
   * What hides on a scroll is the *bottom* nav, not this screen's header.
   *
   * The header carries which book and chapter you are in, which is the one thing a
   * reader loses track of; the tab bar carries nothing while you are reading. The
   * design hides the latter and keeps the former, and it was the wrong way round here.
   */
  const [navVisible, setNavVisible] = useState(true)
  const lastOffset = useRef(0)
  const list = useRef<FlatList<Verse>>(null)
  /*
   * When a programmatic scroll last happened. Jumping to a referenced verse fires
   * `onScroll` like any downward swipe, which hid the nav exactly when someone
   * arriving from a cross-reference most needs to see which chapter they landed in.
   */
  const jumpedAt = useRef(0)

  useEffect(() => {
    void (async () => {
      setTranslation(await translationFor(readerLanguage))
      setScale(await readerFontScale())
      setLoading(false)
    })()
  }, [readerLanguage])

  /*
   * A deep link wins over whatever was last open. Applied during render rather than
   * in an effect so the reader never paints the previous chapter first.
   */
  const linked = params.book ? `${params.book}:${params.chapter}:${params.verse ?? ''}` : null
  const [appliedLink, setAppliedLink] = useState<string | null>(null)
  if (linked && linked !== appliedLink) {
    setAppliedLink(linked)
    setBook(Number(params.book))
    setChapter(Number(params.chapter ?? 1))
    setTarget(params.verse ? Number(params.verse) : null)
    setHits(null)
    setQuery('')
    // Arriving from a cross-reference should land on the text, not on the picker
    // someone happened to leave open earlier.
    setPicking(false)
    setNavVisible(true)
  }

  const load = useCallback(async () => {
    if (!translation) return
    const [rows, count, marks, mark] = await Promise.all([
      chapterVerses(translation.code, book, chapter),
      chapterCount(translation.code, book),
      listHighlights(book, chapter),
      isBookmarked(book, chapter),
    ])
    setVerses(rows)
    setChapters(count)
    setHighlights(new Set(marks))
    setBookmarked(mark)
  }, [translation, book, chapter])

  useEffect(() => {
    void load()
  }, [load])

  /* Drive the shared switch, and always give the bar back on the way out. */
  useEffect(() => {
    setHidden(!navVisible)
    return () => setHidden(false)
  }, [navVisible, setHidden])

  /*
   * Bring the referenced verse into view.
   *
   * Opening the right chapter is not the same as showing the verse: Psalm 18:20 is
   * well below the fold, and a cross-reference that lands you at verse 1 has not
   * really resolved. Runs after the chapter is in state so the row exists to scroll
   * to.
   */
  useEffect(() => {
    if (target === null || verses.length === 0) return
    const index = verses.findIndex((v) => v.verse === target)
    if (index <= 0) return
    /*
     * Twice, deliberately. The first call usually cannot reach a verse far down the
     * chapter because those rows are not rendered yet, and the failure handler can
     * only scroll to a guess. That guess renders the rows around it, so the second
     * call lands exactly — without it, Psalm 18:20 stopped at verse 2.
     */
    const timers = [
      setTimeout(() => {
        list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.25 })
      }, 60),
      setTimeout(() => {
        jumpedAt.current = Date.now()
        list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.25 })
        setNavVisible(true)
      }, 400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [target, verses])

  const runSearch = async () => {
    if (!translation || query.trim().length < 2) return setHits(null)
    setHits(await searchVerses(translation.code, query))
  }

  const go = (nextBook: number, nextChapter: number) => {
    setBook(nextBook)
    setChapter(nextChapter)
    setTarget(null)
    setHits(null)
    setNavVisible(true)
  }

  const step = (by: number) => {
    const next = chapter + by
    if (next >= 1 && next <= chapters) return go(book, next)
    // Past either end, roll into the neighbouring book rather than stopping dead.
    const nextBook = book + by
    if (nextBook >= 1 && nextBook <= 66) {
      void (async () => {
        const count = translation ? await chapterCount(translation.code, nextBook) : 1
        go(nextBook, by > 0 ? 1 : Math.max(count, 1))
      })()
    }
  }

  const title = `${bookName(book, readerLanguage)} ${chapter}`
  /* Scripture is set at the design's 18.5, scaled by whatever the member chose. */
  const bodySize = 18.5 * scale
  const f = fonts(language)

  if (loading) {
    return (
      <View style={styles.centre}>
        <PaperBackdrop />
        <ActivityIndicator color={theme.color.accent} />
      </View>
    )
  }

  /*
   * No bundled text for this language. Not an error state: it is what ships until
   * the licensing gate clears, so it reads as an offer rather than an apology.
   */
  if (!translation) {
    return (
      <View style={styles.centre}>
        <PaperBackdrop />
        <Title language={language} size={30} style={styles.emptyTitle}>
          {t('readerElsewhereTitle')}
        </Title>
        <Body language={language} colour={theme.color.inkSecondary} style={styles.emptyBody}>
          {t('readerElsewhereBody')}
        </Body>
        <PrimaryButton
          language={language}
          label={t('readerOpenElsewhere')}
          arrow={false}
          style={styles.emptyCta}
          onPress={() => void openExternally(book, chapter, target, readerLanguage)}
        />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      {/*
        * Always on screen: it is the only thing saying where you are.
        *
        * The kicker row carries the two controls the design has no counterpart for —
        * text size and the bookmark — because that row is otherwise empty, and putting
        * them beside the chapter arrows would have made four circles competing for the
        * same corner.
        */}
      <View style={[styles.header, { paddingTop: insets.top + 2 }]}>
        <View style={styles.kickerRow}>
          <Kicker language={language} size={12} style={styles.kicker}>
            {readerLanguage === 'am' ? t('bibleHeaderAm') : t('bibleHeaderEn')}
          </Kicker>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('readerTextSize')}
            hitSlop={8}
            onPress={async () => {
              const next = scale >= 1.6 ? 0.9 : Math.round((scale + 0.15) * 100) / 100
              setScale(next)
              await setReaderFontScale(next)
            }}
            style={styles.quiet}
          >
            <Text style={[styles.quietText, { fontFamily: f.label }]}>
              A{scale > 1.1 ? '⁺' : ''}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            // ★ and ☆ differ by one character and not at all when spoken.
            accessibilityLabel={bookmarked ? t('readerUnbookmark') : t('readerBookmark')}
            hitSlop={8}
            onPress={async () => setBookmarked(await toggleBookmark(book, chapter))}
            style={styles.quiet}
          >
            <Text style={[styles.quietText, bookmarked && styles.quietOn]}>
              {bookmarked ? '★' : '☆'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.titleRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.titlePress}
            onPress={() => setPicking((current) => !current)}
          >
            <Title language={readerLanguage} size={34} accessibilityRole="header">
              {title}
            </Title>
          </Pressable>

          <View style={styles.steps}>
            <Step label="‹" onPress={() => step(-1)} accessibilityLabel={t('readerPrevious')} />
            <Step label="›" onPress={() => step(1)} accessibilityLabel={t('readerNext')} />
          </View>
        </View>
      </View>

      {picking && (
        <View style={styles.picker}>
          <TextInput
            style={[styles.search, { fontFamily: f.body }]}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void runSearch()}
            returnKeyType="search"
            placeholder={t('readerSearch')}
            placeholderTextColor={theme.color.inkMuted}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.bookRow}>
              {BOOKS.map((b) => (
                <Pressable accessibilityRole="button"
                  key={b.index}
                  onPress={() => {
                    go(b.index, 1)
                    setPicking(false)
                  }}
                  style={[styles.bookChip, b.index === book && styles.bookChipOn]}
                >
                  <Text
                    style={[
                      styles.bookChipText,
                      { fontFamily: fonts(readerLanguage).label },
                      b.index === book && styles.bookChipTextOn,
                    ]}
                  >
                    {readerLanguage === 'am' ? b.am : b.en}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.bookRow}>
              {Array.from({ length: chapters }, (_, i) => i + 1).map((n) => (
                <Pressable accessibilityRole="button"
                  key={n}
                  onPress={() => {
                    go(book, n)
                    setPicking(false)
                  }}
                  style={[styles.chapterChip, n === chapter && styles.bookChipOn]}
                >
                  <Text
                    style={[
                      styles.bookChipText,
                      { fontFamily: f.numeric },
                      n === chapter && styles.bookChipTextOn,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {hits !== null ? (
        <FlatList
          data={hits}
          keyExtractor={(h) => `${h.book}.${h.chapter}.${h.verse}`}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { fontFamily: f.labelStrong }]}>
              {hits.length === 0 ? t('readerNoResults') : `${hits.length}`}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button"
              style={styles.hit}
              onPress={() => {
                go(item.book, item.chapter)
                setTarget(item.verse)
                setPicking(false)
              }}
            >
              <Text style={[styles.hitRef, { fontFamily: f.labelStrong }]}>
                {bookName(item.book, readerLanguage)} {item.chapter}:{item.verse}
              </Text>
              <Text
                style={[
                  styles.hitText,
                  {
                    fontFamily: fonts(readerLanguage).body,
                    lineHeight: lineHeightFor(readerLanguage, 15),
                  },
                ]}
              >
                {item.text}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          ref={list}
          data={verses}
          keyExtractor={(v) => String(v.verse)}
          contentContainerStyle={styles.page}
          /*
           * Verses are of wildly different lengths, so there is no `getItemLayout` to
           * give. Without this handler a scroll past the rendered window throws
           * instead of scrolling.
           */
          onScrollToIndexFailed={({ index, averageItemLength }) => {
            list.current?.scrollToOffset({
              offset: index * (averageItemLength || 80),
              animated: false,
            })
          }}
          onScroll={(event) => {
            const y = event.nativeEvent.contentOffset.y
            if (Date.now() - jumpedAt.current < 800) {
              // Settling after a jump, not a gesture. Record the position so the
              // next real swipe is measured from here.
              lastOffset.current = y
              return
            }
            // A small threshold: without one, the nav flickers on the jitter of a
            // finger resting on the screen.
            if (Math.abs(y - lastOffset.current) > 12) {
              setNavVisible(y < lastOffset.current || y < 40)
              lastOffset.current = y
            }
          }}
          scrollEventThrottle={32}
          ListFooterComponent={
            /* The same two steps as the header, for whoever reaches the end of a chapter. */
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={() => step(-1)} style={styles.pager}>
                <Text style={[styles.pagerText, { fontFamily: f.label }]}>
                  ← {t('readerPrevious')}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => step(1)} style={styles.pager}>
                <Text style={[styles.pagerText, { fontFamily: f.label }]}>
                  {t('readerNext')} →
                </Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button"
              onLongPress={async () => {
                const on = !highlights.has(item.verse)
                await setHighlight(book, chapter, item.verse, on)
                setHighlights((prev) => {
                  const next = new Set(prev)
                  if (on) next.add(item.verse)
                  else next.delete(item.verse)
                  return next
                })
              }}
              style={[
                styles.verseRow,
                highlights.has(item.verse) && styles.verseHighlighted,
                target === item.verse && styles.verseTarget,
              ]}
            >
              {/*
                * One paragraph per verse, with the number set into the first line —
                * not a number column beside a text column. The design sets scripture as
                * prose, and a two-column row put every verse's first line on its own
                * indent.
                */}
              <Text
                style={[
                  styles.verseText,
                  {
                    /* The reading face follows the *scripture* language, not the interface. */
                    fontFamily: fonts(readerLanguage).body,
                    fontSize: bodySize,
                    lineHeight: Math.round(bodySize * 1.66),
                  },
                ]}
              >
                <Text style={[styles.verseNumber, { fontFamily: f.labelStrong }]}>
                  {item.verse}
                </Text>
                {'  '}
                {item.text}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

/** One of the two ink circles beside the chapter title. */
function Step({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  accessibilityLabel: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
      onPress={onPress}
    >
      <Text style={styles.stepGlyph}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
    gap: 14,
  },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { textAlign: 'center' },
  emptyCta: { alignSelf: 'stretch', marginTop: 8 },

  header: { paddingHorizontal: 24, paddingBottom: 14 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  kicker: { flex: 1 },
  quiet: { paddingHorizontal: 2 },
  quietText: { fontSize: 15, lineHeight: 18, color: theme.color.inkMuted },
  quietOn: { color: theme.color.flame },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  titlePress: { flex: 1 },
  steps: { flexDirection: 'row', gap: 8 },
  step: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.color.inkDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPressed: { opacity: 0.8 },
  stepGlyph: { fontSize: 19, lineHeight: 22, color: theme.color.accentBright },

  picker: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  search: {
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#2c3318',
  },
  bookRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  bookChip: {
    paddingVertical: 7,
    paddingHorizontal: 15,
    borderRadius: theme.radius.pillSoft,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  chapterChip: {
    minWidth: 38,
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pillSoft,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  bookChipOn: { backgroundColor: theme.color.inkDeep, borderColor: theme.color.inkDeep },
  bookChipText: { fontSize: 12, color: theme.color.chipIdle },
  bookChipTextOn: { color: theme.color.accentBright },

  page: { paddingTop: 6, paddingHorizontal: 26, paddingBottom: theme.layout.navClearance },
  verseRow: {
    marginBottom: 13,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  verseHighlighted: { backgroundColor: 'rgba(246,188,69,.22)' },
  verseTarget: { backgroundColor: 'rgba(94,126,51,.13)' },
  /*
   * Set inline, in the reading face. The size comes from the member's own scale, which
   * is why this style has no `fontSize` for a font to hang on.
   */
  verseNumber: { fontSize: 11, color: theme.color.accent },
  verseText: { color: '#262c17' },

  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 26,
    gap: 12,
  },
  pager: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: theme.radius.pillSoft,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  pagerText: { fontSize: 13, color: theme.color.accent },

  resultCount: {
    paddingHorizontal: 26,
    paddingVertical: 14,
    fontSize: 10,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.inkFaint,
  },
  hit: {
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    gap: 4,
  },
  hitRef: { fontSize: 11.5, letterSpacing: 1.6, color: theme.color.accent },
  hitText: { fontSize: 15, color: theme.color.inkBody },
})
