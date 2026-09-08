import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
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
 *
 * The card is a row — icon, then a text column — not a stack. The app name and the
 * timestamp sit at opposite ends of the column's own first line, the way an OS
 * notification actually lays out its header, rather than sharing a row with the icon.
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
      <InkBackdrop variant="notification" style={styles.stageBg} />

      <View style={styles.card}>
        {/*
          * The icon is the character's own gradient, clipped to the tile's rounded
          * corner — the mascot sits larger than the tile and is pushed to its bottom
          * edge, so only its face shows, peeking up the way the design draws it.
          */}
        <View style={styles.appIcon}>
          <LinearGradient
            colors={['#A0331F', '#C6452A', '#8E2A18']}
            locations={[0, 0.6, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.42, y: 0.91 }}
            style={StyleSheet.absoluteFill}
          />
          <Mascot mood="idle" size={34} style={styles.appIconMascot} />
        </View>

        <View style={styles.textCol}>
          <View style={styles.metaRow}>
            <Text style={[styles.appName, { fontFamily: f.label }]}>
              {translate('appName', language)}
            </Text>
            <Text style={[styles.appName, { fontFamily: f.label }]}>
              {translate('justNow', language)}
            </Text>
          </View>

          <Text
            style={[
              styles.title,
              { fontFamily: f.labelStrong, lineHeight: lineHeightFor(language, 14) },
            ]}
          >
            {trimmed.length > 0 ? `${greeting}, ${trimmed}` : greeting}
          </Text>
          <Text
            style={[styles.body, { fontFamily: f.body, lineHeight: lineHeightFor(language, 13) }]}
          >
            {translate('notifSampleBody', language)}
          </Text>
        </View>
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    /* Not quite opaque, so a little of the ink beneath shows through as an OS card does. */
    backgroundColor: 'rgba(242,243,226,.96)',
    borderRadius: theme.radius.md,
    padding: 13,
  },
  appIcon: {
    flex: 0,
    flexShrink: 0,
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  /* Sized larger than the tile and pinned to its bottom edge, so it is clipped to a peek. */
  appIconMascot: { marginBottom: -8 },

  textCol: { flex: 1, minWidth: 0, gap: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  appName: {
    fontSize: 11,
    letterSpacing: 0.4,
    color: theme.color.inkMuted,
  },
  title: { fontSize: 14, color: theme.color.ink },
  body: { fontSize: 13, color: theme.color.inkBodySoft },

  schedule: {
    alignSelf: 'center',
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.onInkSecondary,
  },
})
