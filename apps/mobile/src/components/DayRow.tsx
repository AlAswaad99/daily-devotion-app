import { Pressable, StyleSheet, Text, View } from 'react-native'
import { formatEthiopic, type Language, type LibraryDay } from '@abide/domain'
import { formatRef } from '@abide/content'
import { Kicker, PaperCard, RiseFade, Subtitle, UiText } from './ui'
import { translate } from '../lib/i18n'
import { fonts, theme } from '../lib/theme'

/**
 * One devotion, as a row.
 *
 * The same row appears in the library's filtered results and in a series, so it lives
 * here rather than twice. Its number chip carries the day's state — amber for today,
 * lime for read, grey for not — and the pills underneath say the same thing in words,
 * because colour alone is not a label.
 */
export function DayRow({
  day,
  language,
  onPress,
  today,
  series,
}: {
  day: LibraryDay
  language: Language
  onPress: () => void
  /** Today in ministry time, so the row can mark itself rather than being told to. */
  today?: string | null
  /** The library names the series on every row; inside one series that would be noise. */
  series?: string | undefined
}) {
  const f = fonts(language)
  const t = (key: Parameters<typeof translate>[0], vars?: Record<string, string | number>) =>
    translate(key, language, vars)

  const isToday = today !== null && today !== undefined && day.scheduledDate === today
  const chip = isToday
    ? { bg: theme.color.flame, fg: '#2a1a05' }
    : day.completed
      ? { bg: 'rgba(94,126,51,.14)', fg: theme.color.accentDeep }
      : { bg: theme.color.panel, fg: theme.color.inkMuted }

  const pills: { label: string; bg: string; fg: string; border: string }[] = []
  if (isToday) {
    pills.push({ label: t('pillToday'), bg: theme.color.flame, fg: '#2a1a05', border: 'transparent' })
  } else if (day.completed) {
    pills.push({
      label: `✓ ${formatEthiopic(day.scheduledDate, language)}`,
      bg: 'rgba(94,126,51,.13)',
      fg: theme.color.accentDeep,
      border: 'transparent',
    })
  } else {
    pills.push({
      label: t('pillNotRead'),
      bg: 'transparent',
      fg: theme.color.inkMuted,
      border: theme.color.line,
    })
  }
  if (day.reflected) {
    pills.push({
      label: `✎ ${t('pillReflection')}`,
      bg: theme.color.tagBg,
      fg: theme.color.tagInk,
      border: 'transparent',
    })
  }

  /* Series and passage, as the design has it — the series only where it is not obvious. */
  const sub = [series, day.passage ? formatRef(day.passage, language) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <RiseFade>
      <Pressable accessibilityRole="button" onPress={onPress}>
        <PaperCard style={styles.row}>
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.chipText, { fontFamily: f.labelStrong, color: chip.fg }]}>
              {day.dayNumber}
            </Text>
          </View>

          <View style={styles.main}>
            <Subtitle
              language={language}
              size={18.5}
              numberOfLines={2}
              colour={day.completed || isToday ? theme.color.ink : theme.color.inkSecondary}
            >
              {language === 'am' ? day.topicAm : day.topicEn}
            </Subtitle>

            {sub.length > 0 && (
              <UiText
                language={language}
                size={11}
                colour={theme.color.inkMuted}
                numberOfLines={1}
                style={styles.sub}
              >
                {sub}
              </UiText>
            )}

            <View style={styles.pills}>
              {pills.map((pill) => (
                <View
                  key={pill.label}
                  style={[styles.pill, { backgroundColor: pill.bg, borderColor: pill.border }]}
                >
                  <Kicker language={language} size={8.8} tracking={1.3} colour={pill.fg}>
                    {pill.label}
                  </Kicker>
                </View>
              ))}
            </View>
          </View>

          {/* Always drawn, so a row's favourite state is a thing you can see it lacks. */}
          <Text style={[styles.star, day.favourite && styles.starOn]}>
            {day.favourite ? '★' : '☆'}
          </Text>
        </PaperCard>
      </Pressable>
    </RiseFade>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
  },
  chip: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontSize: 12.5, lineHeight: 15 },
  main: { flex: 1, minWidth: 0 },
  sub: { marginTop: 3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: theme.radius.pillSoft,
    borderWidth: 1,
  },
  star: {
    fontSize: 17,
    lineHeight: 21,
    width: 24,
    textAlign: 'center',
    color: theme.color.inkFaint,
  },
  starOn: { color: theme.color.flame },
})
