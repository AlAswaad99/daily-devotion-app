import { useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Language } from '@abide/domain'
import { PaperBackdrop } from '../src/components/Backdrop'
import { ScreenHeader } from '../src/components/ui'
import { useProfile } from '../src/lib/profile'
import { lineHeightFor, translate } from '../src/lib/i18n'
import { fonts, theme } from '../src/lib/theme'
import {
  bookName, chapterVerses, listTranslations, type Translation, type Verse,
} from '../src/lib/scripture'

/**
 * The chapter currently open in the reader, in every bundled language at once.
 *
 * Each column scrolls on its own — the two texts are not verse-aligned, Amharic and
 * English do not break at the same points, and pinning them to a shared scroll
 * position would fight that rather than help someone actually comparing wording.
 */
export default function BibleCompare() {
  const { language } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ book: string; chapter: string }>()
  const book = Number(params.book)
  const chapter = Number(params.chapter)

  const [columns, setColumns] = useState<{ translation: Translation; verses: Verse[] }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const all = await listTranslations()
      const withVerses = await Promise.all(
        all.map(async (translation) => ({
          translation,
          verses: await chapterVerses(translation.code, book, chapter),
        })),
      )
      if (cancelled) return
      setColumns(withVerses)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [book, chapter])

  const t = (key: Parameters<typeof translate>[0]) => translate(key, language)

  return (
    <View style={styles.screen}>
      <PaperBackdrop />

      <ScreenHeader
        kicker={t('readerCompare')}
        language={language}
        backLabel={t('back')}
        onBack={() => router.back()}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      />

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={theme.color.accent} />
        </View>
      ) : (
        <View style={styles.columns}>
          {columns.map(({ translation, verses }, i) => {
            const lang = translation.language as Language
            const f = fonts(lang)
            return (
              <ScrollView
                key={translation.code}
                style={[styles.column, i > 0 && styles.columnDivider]}
                contentContainerStyle={styles.columnContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[styles.columnTitle, { fontFamily: f.labelStrong }]}>
                  {bookName(book, lang)} {chapter}
                </Text>
                {verses.map((v) => (
                  <Text
                    key={v.verse}
                    style={[
                      styles.verseText,
                      { fontFamily: f.body, lineHeight: lineHeightFor(lang, 15) },
                    ]}
                  >
                    <Text style={styles.verseNumber}>{v.verse} </Text>
                    {v.text}
                  </Text>
                ))}
              </ScrollView>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingBottom: 12 },

  columns: { flex: 1, flexDirection: 'row' },
  column: { flex: 1 },
  columnDivider: { borderLeftWidth: 1, borderLeftColor: theme.color.line },
  columnContent: { paddingHorizontal: 14, paddingBottom: theme.layout.navClearance, paddingTop: 4 },
  columnTitle: {
    fontSize: 12.5,
    letterSpacing: theme.tracking.kickerTight,
    color: theme.color.kicker,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  verseText: { fontSize: 14.5, color: theme.color.inkBody, marginBottom: 9 },
  verseNumber: { fontSize: 10.5, color: theme.color.accent },
})
