import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { BOOKS } from '@abide/content'
import { useProfile } from '../../src/lib/profile'
import { lineHeightFor } from '../../src/lib/i18n'
import { theme } from '../../src/lib/theme'
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

  // Hidden while reading, back on a scroll up — the nav is the only thing competing
  // with the text for a small screen.
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
  const bodySize = theme.size.body * scale

  if (loading) {
    return (
      <View style={styles.centre}>
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
        <Text style={styles.emptyTitle}>{t('readerElsewhereTitle')}</Text>
        <Text style={styles.emptyBody}>{t('readerElsewhereBody')}</Text>
        <Pressable accessibilityRole="button"
          style={styles.primary}
          onPress={() => void openExternally(book, chapter, target, readerLanguage)}
        >
          <Text style={styles.primaryText}>{t('readerOpenElsewhere')}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {navVisible && (
        <View style={styles.nav}>
          <Pressable accessibilityRole="button" onPress={() => setPicking((p) => !p)} style={styles.navTitle}>
            <Text style={styles.navTitleText}>{title}</Text>
          </Pressable>

          <View style={styles.navActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('readerTextSize')}
              onPress={async () => {
                const next = scale >= 1.6 ? 0.9 : Math.round((scale + 0.15) * 100) / 100
                setScale(next)
                await setReaderFontScale(next)
              }}
              style={styles.navButton}
            >
              <Text style={styles.navButtonText}>A{scale > 1.1 ? '⁺' : ''}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              // ★ and ☆ differ by one character and not at all when spoken.
              accessibilityLabel={bookmarked ? t('readerUnbookmark') : t('readerBookmark')}
              onPress={async () => setBookmarked(await toggleBookmark(book, chapter))}
              style={styles.navButton}
            >
              <Text style={[styles.navButtonText, bookmarked && styles.navButtonOn]}>
                {bookmarked ? '★' : '☆'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {picking && (
        <View style={styles.picker}>
          <TextInput
            style={styles.search}
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
                  <Text style={styles.bookChipText}>
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
                  <Text style={styles.bookChipText}>{n}</Text>
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
            <Text style={styles.resultCount}>
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
              <Text style={styles.hitRef}>
                {bookName(item.book, readerLanguage)} {item.chapter}:{item.verse}
              </Text>
              <Text style={[styles.hitText, { lineHeight: lineHeightFor(readerLanguage, 15) }]}>
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
            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={() => step(-1)} style={styles.step}>
                <Text style={styles.stepText}>← {t('readerPrevious')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => step(1)} style={styles.step}>
                <Text style={styles.stepText}>{t('readerNext')} →</Text>
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
              <Text style={styles.verseNumber}>{item.verse}</Text>
              <Text
                style={[
                  styles.verseText,
                  { fontSize: bodySize, lineHeight: lineHeightFor(readerLanguage, bodySize) },
                ]}
              >
                {item.text}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centre: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: theme.space(3), gap: theme.space(2), backgroundColor: theme.color.bg,
  },
  emptyTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.title, color: theme.color.ink, textAlign: 'center' },
  emptyBody: {
    fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.inkMuted, textAlign: 'center',
  },
  primary: {
    backgroundColor: theme.color.accent, paddingVertical: theme.space(1.5),
    paddingHorizontal: theme.space(3), borderRadius: theme.radius.pill,
  },
  primaryText: { color: '#fff', fontFamily: theme.font.body,
    fontSize: theme.size.body },

  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: theme.space(2), paddingVertical: theme.space(1.5),
    borderBottomWidth: 1, borderBottomColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  navTitle: { flex: 1 },
  navTitleText: { fontFamily: theme.font.bodyMedium,
    fontSize: theme.size.title, color: theme.color.ink },
  navActions: { flexDirection: 'row', gap: theme.space(1) },
  navButton: { paddingHorizontal: theme.space(1.5), paddingVertical: theme.space(0.5) },
  navButtonText: { fontFamily: theme.font.body,
    fontSize: theme.size.title, color: theme.color.inkMuted },
  navButtonOn: { color: theme.color.accent },

  picker: {
    padding: theme.space(1.5), gap: theme.space(1),
    backgroundColor: theme.color.surface,
    borderBottomWidth: 1, borderBottomColor: theme.color.line,
  },
  search: {
    borderWidth: 1, borderColor: theme.color.line, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space(1.5), paddingVertical: theme.space(1),
    color: theme.color.ink, fontFamily: theme.font.body,
    fontSize: theme.size.body,
  },
  bookRow: { flexDirection: 'row', gap: theme.space(0.75), paddingVertical: theme.space(0.5) },
  bookChip: {
    paddingHorizontal: theme.space(1.5), paddingVertical: theme.space(0.75),
    borderRadius: theme.radius.pill, backgroundColor: theme.color.bg,
  },
  chapterChip: {
    minWidth: 36, alignItems: 'center',
    paddingHorizontal: theme.space(1), paddingVertical: theme.space(0.75),
    borderRadius: theme.radius.pill, backgroundColor: theme.color.bg,
  },
  bookChipOn: { backgroundColor: theme.color.accentSoft },
  bookChipText: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.ink },

  page: { padding: theme.space(2), paddingBottom: theme.space(6) },
  verseRow: {
    flexDirection: 'row', gap: theme.space(1),
    paddingVertical: theme.space(0.75), paddingHorizontal: theme.space(0.5),
    borderRadius: theme.radius.sm,
  },
  verseHighlighted: { backgroundColor: theme.color.accentSoft },
  verseTarget: { backgroundColor: theme.color.prayer },
  verseNumber: {
    fontFamily: theme.font.body,
    fontSize: theme.size.micro, color: theme.color.accent,
    minWidth: 18, textAlign: 'right', paddingTop: 4,
  },
  // Scripture, in the reading face. Its size is set inline from the member's
  // chosen scale, which is why this style has no fontSize to hang a font on.
  verseText: { flex: 1, color: theme.color.ink, fontFamily: theme.font.reading },

  footer: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: theme.space(3), gap: theme.space(2),
  },
  step: {
    paddingVertical: theme.space(1.5), paddingHorizontal: theme.space(2),
    borderRadius: theme.radius.pill, backgroundColor: theme.color.surface,
  },
  stepText: { fontFamily: theme.font.body,
    fontSize: theme.size.body, color: theme.color.accent },

  resultCount: {
    padding: theme.space(2), fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted,
  },
  hit: {
    paddingHorizontal: theme.space(2), paddingVertical: theme.space(1.5),
    borderBottomWidth: 1, borderBottomColor: theme.color.line, gap: 4,
  },
  hitRef: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.accent },
  hitText: { fontFamily: theme.font.reading,
    fontSize: 15, color: theme.color.ink },
})
