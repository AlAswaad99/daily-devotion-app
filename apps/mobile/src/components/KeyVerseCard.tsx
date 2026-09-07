import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg'
import { formatRef } from '@abide/content'
import type { Language, ScriptureRef } from '@abide/domain'
import { chapterVerses, translationFor } from '../lib/scripture'
import { lineHeightFor, translate } from '../lib/i18n'
import { fonts, theme } from '../lib/theme'
import { Kicker } from './ui'

/**
 * The key verse, on the ink card the design gives it.
 *
 * The design shows the verse *text*; the content pipeline stores references only, so
 * the text is fetched from the bundled scripture database and the card falls back to
 * the reference alone when that language has no bundled translation. That is the
 * honest degradation: the card still names what to read, and the "Read the full
 * chapter" bar beneath it still goes there.
 *
 * Its bottom corners are nearly square because the bar below completes the shape — the
 * two are one object with a seam, not two cards that happen to touch.
 */
export function KeyVerseCard({
  reference,
  language,
  readerLanguage,
  square = true,
}: {
  reference: ScriptureRef
  language: Language
  /** Scripture comes in the member's reading language, which can differ from the UI. */
  readerLanguage: Language
  /** False when nothing follows the card, so all four corners round. */
  square?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const f = fonts(language)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const translation = await translationFor(readerLanguage)
      if (!translation) return
      const verses = await chapterVerses(translation.code, reference.book, reference.chapter)
      if (cancelled) return

      const from = reference.verseStart ?? 1
      const to = reference.verseEnd ?? from
      const picked = verses
        .filter((v) => v.verse >= from && v.verse <= to)
        .map((v) => v.text)
        .join(' ')
      if (picked.length > 0) setText(picked)
    })()
    return () => {
      cancelled = true
    }
  }, [reference, readerLanguage])

  return (
    <View
      style={[styles.card, square && styles.cardSeamed]}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
    >
      {/*
        * A real radial, with the light at the top centre.
        *
        * Sized from a measured layout rather than from percentages: an SVG canvas inside
        * a box whose height comes from its own content lays itself out at nothing, and
        * the card painted a dark strip under the label and left the verse white on
        * white. The solid base underneath means that even before the first layout pass
        * the card is dark, so nothing is ever unreadable.
        */}
      {size !== null && (
        <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="verse" cx="50%" cy="0%" rx="120%" ry="90%">
              <Stop offset="0" stopColor="#2c3a16" />
              <Stop offset="1" stopColor="#131a0a" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size.width} height={size.height} fill="url(#verse)" />
        </Svg>
      )}

      <Kicker language={language} colour={theme.color.accentBright} style={styles.label}>
        {translate('keyVerseTag', language)} · {formatRef(reference, language)}
      </Kicker>

      {text !== null && (
        <Text
          style={[
            styles.verse,
            { fontFamily: f.italic, lineHeight: lineHeightFor(language, 21) },
          ]}
        >
          “{text}”
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: 22,
    backgroundColor: '#131a0a',
    borderRadius: theme.radius.calendar,
    overflow: 'hidden',
    ...theme.shadow.inkCard,
  },
  cardSeamed: { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  label: { marginBottom: 10 },
  verse: { fontSize: 21, color: '#eef2da' },
})
