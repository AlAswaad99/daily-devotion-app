import { StyleSheet, Text, View } from 'react-native'
import {
  formatWindow, partOfDayForMinute, type Language, type MinuteOfDay, type PartOfDay,
} from '@abide/domain'
import { InkBackdrop } from '../Backdrop'
import { Mascot } from '../Mascot'
import { translate, lineHeightFor } from '../../lib/i18n'
import { fonts, theme } from '../../lib/theme'

const GREETING: Record<PartOfDay, 'greetingMorning'> = {
  morning: 'greetingMorning',
  afternoon: 'greetingAfternoon' as 'greetingMorning',
  evening: 'greetingEvening' as 'greetingMorning',
  night: 'greetingNight' as 'greetingMorning',
}

/**
 * What the reminder will look like, shown before asking permission for it.
 *
 * The card is a mock, not a real notification — nothing here goes through the OS. It
 * exists so the permission prompt is not the first time a member learns what they are
 * agreeing to receive, which is the difference between a considered yes and a reflexive
 * no.
 *
 * The greeting and the window come from what was actually chosen on the previous step
 * rather than from the design's fixed "Good morning" and "EVERY MORNING", because a
 * preview that shows something other than what was configured teaches the member to
 * distrust it.
 */
export function NotificationPreview({
  name,
  start,
  duration,
  language,
}: {
  name: string
  start: MinuteOfDay
  duration: number
  language: Language
}) {
  const f = fonts(language)
  const part = partOfDayForMinute(start)
  const greeting = translate(GREETING[part], language)
  const trimmed = name.trim()

  return (
    <View style={styles.stage}>
      {/* Ink, so the paper notification card reads as sitting on a phone's lock screen. */}
      <InkBackdrop variant="streak" style={styles.stageBg} />

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.appIcon}>
            <Mascot mood="idle" size={26} />
          </View>
          <Text style={[styles.appName, { fontFamily: f.label }]}>
            Abide · {translate('justNow', language)}
          </Text>
        </View>

        <Text
          style={[styles.title, { fontFamily: f.label, lineHeight: lineHeightFor(language, 15) }]}
        >
          {trimmed.length > 0 ? `${greeting}, ${trimmed}` : greeting}
        </Text>
        <Text
          style={[styles.body, { fontFamily: f.body, lineHeight: lineHeightFor(language, 13.5) }]}
        >
          {translate('notifSampleBody', language)}
        </Text>
      </View>

      <Text style={[styles.schedule, { fontFamily: f.label }]}>
        {translate('everyDay', language)} · {formatWindow(start, duration, language)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  stage: {
    marginTop: theme.space(4),
    borderRadius: theme.radius.sheet,
    overflow: 'hidden',
    padding: theme.space(2.5),
    gap: theme.space(2),
  },
  stageBg: { borderRadius: theme.radius.sheet },

  card: {
    /* Not quite opaque, so a little of the ink beneath shows through as an OS card does. */
    backgroundColor: 'rgba(242,243,226,.96)',
    borderRadius: theme.radius.md,
    padding: 13,
    gap: 5,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: theme.color.inkDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  appName: {
    fontSize: 11,
    letterSpacing: 0.4,
    color: theme.color.inkMuted,
  },
  title: { fontSize: 15, color: theme.color.ink },
  body: { fontSize: 13.5, color: theme.color.inkSecondary },

  schedule: {
    alignSelf: 'center',
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.onInkSecondary,
  },
})
