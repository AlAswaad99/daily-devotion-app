import { useCallback, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { InkBackdrop } from '../src/components/Backdrop'
import { Numeral, ScreenHeader, UiText } from '../src/components/ui'
import { listSessions, summary, type PrayerSession, type PrayerSummary } from '../src/data/prayer'
import { useProfile } from '../src/lib/profile'
import { fonts, theme } from '../src/lib/theme'

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Everything the Focus screen used to carry on its own face — totals, and every
 * past session — moved one tap away.
 *
 * The timer screen is for sitting still; a running total and a scroll of past
 * sessions are for someone who wants to look back, which is a different moment.
 */
export default function FocusHistory() {
  const { language, t } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const f = fonts(language)

  const [history, setHistory] = useState<PrayerSession[]>([])
  const [stats, setStats] = useState<PrayerSummary | null>(null)

  useFocusEffect(
    useCallback(() => {
      void Promise.all([listSessions(60), summary()]).then(([rows, s]) => {
        setHistory(rows)
        setStats(s)
      })
    }, []),
  )

  return (
    <View style={styles.screen}>
      <InkBackdrop variant="streak" />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHeader
          kicker={t('focusHistory')}
          language={language}
          variant="translucent"
          backLabel={t('back')}
          onBack={() => router.back()}
        />

        {stats && (
          <View style={styles.tiles}>
            <Tile value={stats.sessions} label={t('focusSessions')} language={language} />
            <Tile value={stats.minutes} label={t('focusMinutes')} language={language} />
          </View>
        )}
        <UiText language={language} size={11} colour={theme.color.onInkDim} style={styles.tilesNote}>
          {t('focusLast30')}
        </UiText>

        {history.length === 0 ? (
          <UiText
            language={language}
            size={13.5}
            colour={theme.color.onInkSecondary}
            style={styles.empty}
          >
            {t('focusHistoryEmpty')}
          </UiText>
        ) : (
          <View style={styles.history}>
            {history.map((h) => (
              <View key={h.id} style={styles.row}>
                <Text style={[styles.rowWhen, { fontFamily: f.ui }]}>
                  {new Date(h.started_at).toLocaleDateString(language === 'am' ? 'am-ET' : 'en-GB', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                <Text style={[styles.rowMain, { fontFamily: f.numeric }]}>
                  {mmss(h.duration_seconds)}
                </Text>
                <Text style={[styles.rowNote, { fontFamily: f.ui }]}>
                  {h.interruptions > 0 ? `· ${h.interruptions}` : h.completed ? '·' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function Tile({
  value,
  label,
  language,
}: {
  value: number
  label: string
  language: 'en' | 'am'
}) {
  return (
    <View style={styles.tile}>
      <Numeral language={language} size={30} colour={theme.color.onInkBright}>
        {value}
      </Numeral>
      <UiText
        language={language}
        size={11}
        colour={theme.color.onInkSecondary}
        style={styles.tileLabel}
      >
        {label}
      </UiText>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.inkDarkest },
  content: { paddingBottom: 40 },

  tiles: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, marginTop: 28 },
  tile: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.06)',
  },
  tileLabel: { marginTop: 3 },
  tilesNote: { textAlign: 'center', marginTop: 8 },

  empty: { textAlign: 'center', paddingHorizontal: 32, marginTop: 40 },

  history: { paddingHorizontal: 20, marginTop: 26, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowWhen: { fontSize: 12.5, color: theme.color.onInkDim, width: 70 },
  rowMain: { fontSize: 15, color: theme.color.onInk },
  rowNote: { fontSize: 12.5, color: theme.color.onInkDim },
})
