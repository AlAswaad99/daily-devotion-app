import { BOOKS } from '@abide/content'
import type { Language } from '@abide/domain'
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetSectionList,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet'
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { translate } from '../../lib/i18n'
import {
  bookName,
  chapterCount,
  searchVerses,
  type SearchHit,
  type Translation,
} from '../../lib/scripture'
import { fonts, theme } from '../../lib/theme'
import { Icon } from '../Icon'
import { LanguageCards } from '../LanguageCards'
import { Kicker, UiText } from '../ui'
import { ChapterGrid } from './ChapterGrid'
import { FontSlider, FontSliderScale } from './FontSlider'

export interface ReaderSheetHandle {
  present: () => void
  dismiss: () => void
}

/** Genesis through Malachi. Everything past it is New Testament. */
const OLD_TESTAMENT_LAST = 39
const SNAP_POINTS = ['90%']
const PAD = 20

/**
 * Everything the reader used to scatter across a header row and an inline picker,
 * now behind one icon.
 *
 * The three sections — text size, version, navigate — share one scrollable list so
 * gesture-handler only ever has to coordinate one scroll surface with the sheet's own
 * pan-to-dismiss; a second nested scroller (a book list *inside* a scrolling panel) is
 * what actually breaks that coordination. Which list component is mounted — the book
 * index, a chapter grid, or search hits — swaps with `BOOKS`/search state, but there is
 * only ever one.
 */
export const ReaderSheet = forwardRef<
  ReaderSheetHandle,
  {
    language: Language
    readerLanguage: Language
    onChangeReaderLanguage: (next: Language) => void
    translation: Translation | null
    scale: number
    onChangeScale: (next: number) => void
    book: number
    chapter: number
    onNavigate: (book: number, chapter: number, verse?: number) => void
    bookmarked: boolean
    onToggleBookmark: () => void
  }
>(function ReaderSheet(
  {
    language,
    readerLanguage,
    onChangeReaderLanguage,
    translation,
    scale,
    onChangeScale,
    book,
    chapter,
    onNavigate,
    bookmarked,
    onToggleBookmark,
  },
  ref,
) {
  const sheet = useRef<BottomSheetModal>(null)
  const [pickerBook, setPickerBook] = useState<number | null>(null)
  const [pickerChapters, setPickerChapters] = useState(0)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useImperativeHandle(ref, () => ({
    present: () => sheet.current?.present(),
    dismiss: () => sheet.current?.dismiss(),
  }))

  const reset = useCallback(() => {
    setPickerBook(null)
    setPickerChapters(0)
    setQuery('')
    setHits(null)
  }, [])

  const t = useCallback(
    (key: Parameters<typeof translate>[0]) => translate(key, language),
    [language],
  )

  const runSearch = useCallback(async () => {
    if (!translation || query.trim().length < 2) {
      setHits(null)
      return
    }
    setHits(await searchVerses(translation.code, query))
  }, [translation, query])

  const openBook = useCallback(
    async (index: number) => {
      if (!translation) return
      setPickerBook(index)
      setPickerChapters(await chapterCount(translation.code, index))
    },
    [translation],
  )

  const pickChapter = useCallback(
    (n: number) => {
      if (pickerBook === null) return
      onNavigate(pickerBook, n)
      reset()
      sheet.current?.dismiss()
    },
    [pickerBook, onNavigate, reset],
  )

  const pickHit = useCallback(
    (hit: SearchHit) => {
      onNavigate(hit.book, hit.chapter, hit.verse)
      reset()
      sheet.current?.dismiss()
    },
    [onNavigate, reset],
  )

  const sections = useMemo(
    () => [
      { title: t('oldTestament'), data: BOOKS.filter((b) => b.index <= OLD_TESTAMENT_LAST) },
      { title: t('newTestament'), data: BOOKS.filter((b) => b.index > OLD_TESTAMENT_LAST) },
    ],
    [t],
  )

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
    ),
    [],
  )

  const previewSize = 15 * scale
  const showingPicker = pickerBook !== null && hits === null

  const controls: ReactNode = (
    <View style={styles.controls}>
      <Section label={t('readerTextSize')} language={language}>
        <View style={styles.sliderRow}>
          <FontSliderScale label="small" />
          <View style={styles.sliderTrack}>
            <FontSlider value={scale} onChange={onChangeScale} />
          </View>
          <FontSliderScale label="large" />
        </View>
        <View style={styles.preview}>
          <Text
            style={[
              styles.previewText,
              {
                fontFamily: fonts(readerLanguage).body,
                fontSize: previewSize,
                lineHeight: Math.round(previewSize * 1.5),
              },
            ]}
          >
            {translate('readerPreviewSample', readerLanguage)}
          </Text>
        </View>
      </Section>

      <Section label={t('readerVersion')} language={language}>
        <LanguageCards
          value={readerLanguage}
          onChange={onChangeReaderLanguage}
          language={language}
        />
      </Section>

      {/* <Pressable accessibilityRole="button" style={styles.bookmarkRow} onPress={onToggleBookmark}>
        <View style={styles.bookmarkLabel}>
          <Icon
            name="bookmark"
            size={18}
            colour={bookmarked ? theme.color.flame : theme.color.inkSecondary}
          />
          <UiText language={language} size={14.5} colour={theme.color.ink} strong>
            {bookmarked ? t('readerUnbookmark') : t('readerBookmark')}
          </UiText>
        </View>
        <SettingsToggle
          value={bookmarked}
          onChange={onToggleBookmark}
          accessibilityLabel={t('readerBookmark')}
        />
      </Pressable> */}

      <View style={styles.navigateHeader}>
        <Kicker language={language}>{t('readerNavigate')}</Kicker>
        {showingPicker && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            style={styles.backRow}
            onPress={() => setPickerBook(null)}
          >
            <Icon name="chevronLeft" size={15} colour={theme.color.accent} />
            <UiText language={language} size={12.5} colour={theme.color.accent} strong>
              {t('back')}
            </UiText>
          </Pressable>
        )}
      </View>

      <View style={styles.searchRow}>
        <Icon name="search" size={16} colour={theme.color.inkFaint} />
        <BottomSheetTextInput
          style={[styles.search, { fontFamily: fonts(language).body }]}
          value={query}
          onChangeText={(next) => {
            setQuery(next)
            if (next.trim().length === 0) setHits(null)
          }}
          onSubmitEditing={() => void runSearch()}
          returnKeyType="search"
          placeholder={t('readerSearch')}
          placeholderTextColor={theme.color.inkMuted}
        />
        {query.length > 0 && (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              setQuery('')
              setHits(null)
            }}
          >
            <Text style={styles.clear}>×</Text>
          </Pressable>
        )}
      </View>

      {showingPicker && (
        <UiText
          language={language}
          size={13}
          colour={theme.color.inkSecondary}
          strong
          style={styles.chapterHeading}
        >
          {bookName(pickerBook, readerLanguage)}
        </UiText>
      )}
    </View>
  )

  return (
    <BottomSheetModal
      ref={sheet}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.grip}
      backdropComponent={renderBackdrop}
      onDismiss={reset}
    >
      {hits !== null ? (
        <BottomSheetFlatList
          data={hits}
          keyExtractor={(h) => `${h.book}.${h.chapter}.${h.verse}`}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <>
              {controls}
              {hits.length === 0 && (
                <UiText
                  language={language}
                  size={13}
                  colour={theme.color.inkFaint}
                  style={styles.noResults}
                >
                  {t('readerNoResults')}
                </UiText>
              )}
            </>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              style={styles.hit}
              onPress={() => pickHit(item)}
            >
              <UiText language={language} size={11.5} colour={theme.color.accent} strong>
                {bookName(item.book, readerLanguage)} {item.chapter}:{item.verse}
              </UiText>
              <Text
                numberOfLines={2}
                style={[styles.hitText, { fontFamily: fonts(readerLanguage).body }]}
              >
                {item.text}
              </Text>
            </Pressable>
          )}
        />
      ) : showingPicker ? (
        <BottomSheetScrollView contentContainerStyle={styles.listContent}>
          {controls}
          <View style={styles.chapterGrid}>
            <ChapterGrid
              count={pickerChapters}
              selected={pickerBook === book ? chapter : 0}
              onSelect={pickChapter}
              language={readerLanguage}
            />
          </View>
        </BottomSheetScrollView>
      ) : (
        <BottomSheetSectionList
          sections={sections}
          keyExtractor={(item) => String(item.index)}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<>{controls}</>}
          renderSectionHeader={({ section }) => (
            <View style={styles.testamentHeader}>
              <Kicker language={language} size={10.5}>
                {section.title}
              </Kicker>
            </View>
          )}
          renderItem={({ item }) => {
            const on = item.index === book
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.bookRow, on && styles.bookRowOn]}
                onPress={() => void openBook(item.index)}
              >
                <Text
                  style={[
                    styles.bookName,
                    { fontFamily: fonts(readerLanguage).label },
                    on && styles.bookNameOn,
                  ]}
                >
                  {readerLanguage === 'am' ? item.am : item.en}
                </Text>
                <Text style={[styles.bookChevron, on && styles.bookNameOn]}>›</Text>
              </Pressable>
            )
          }}
        />
      )}
    </BottomSheetModal>
  )
})

function Section({
  label,
  language,
  children,
}: {
  label: string
  language: Language
  children: ReactNode
}) {
  return (
    <View style={styles.section}>
      <Kicker language={language} style={styles.sectionLabel}>
        {label}
      </Kicker>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: theme.color.bg,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
  },
  grip: { backgroundColor: theme.color.line, width: 40 },

  listContent: { paddingBottom: 40 },
  controls: { paddingHorizontal: PAD, gap: 20, paddingTop: 4 },
  section: { gap: 10 },
  sectionLabel: {},

  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sliderTrack: { flex: 1 },
  preview: {
    marginTop: 2,
    backgroundColor: theme.color.field,
    borderRadius: 14,
    padding: 14,
  },
  previewText: { color: theme.color.inkBody },

  bookmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    backgroundColor: theme.color.surface,
  },
  bookmarkLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  navigateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -8,
    backgroundColor: theme.color.surface,
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  search: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    color: '#2c3318',
  },
  clear: { fontSize: 18, lineHeight: 20, color: theme.color.inkFaint },

  chapterHeading: { marginTop: -6 },
  chapterGrid: { paddingHorizontal: PAD, paddingTop: 6 },

  testamentHeader: {
    backgroundColor: theme.color.bg,
    paddingHorizontal: PAD,
    paddingTop: 14,
    paddingBottom: 6,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: PAD,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
  },
  bookRowOn: { backgroundColor: 'rgba(94,126,51,.08)' },
  bookName: { fontSize: 14.5, color: theme.color.inkBody, includeFontPadding: false },
  bookNameOn: { color: theme.color.accentDeep },
  bookChevron: { fontSize: 16, color: theme.color.inkFaint },

  noResults: { paddingHorizontal: PAD, paddingTop: 20, textAlign: 'center' },
  hit: {
    paddingHorizontal: PAD,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.line,
    gap: 4,
  },
  hitText: { fontSize: 14, color: theme.color.inkBody },
})
