import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient as RNRadialGradient,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import * as focus from '../../modules/temuagn-focus'
import { InkBackdrop } from '../../src/components/Backdrop'
import { Icon } from '../../src/components/Icon'
import { Kicker } from '../../src/components/ui'
import { endSession, startSession } from '../../src/data/prayer'
import { lineHeightFor } from '../../src/lib/i18n'
import { log } from '../../src/lib/log'
import { useNavVisibility } from '../../src/lib/nav-visibility'
import { useProfile } from '../../src/lib/profile'
import { fonts, theme } from '../../src/lib/theme'

/**
 * Focus — a bounded, intentional prayer session.
 *
 * Separate from study on purpose, and it never touches the streak. Prayer is tracked
 * and shown; scoring it would change what it is for, and a member who prays daily but
 * reads irregularly should not be handed a streak they have not kept.
 *
 * Leaving the app is recorded, not punished. The spec's words for what it should feel
 * like are "no punishment, just a mirror" — so an interrupted session still counts as
 * a session, and the count is stated plainly afterwards rather than scolded about.
 *
 * Visually this is the design's ink screen: the timer is the whole page, the controls
 * sit under it, and the bottom nav slides away while a session runs so there is nothing
 * to leave for.
 */

/** The design's three. Five is a breath, twenty-five is a discipline. */
const PRESETS = [5, 15, 25]

const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function Focus() {
  const { t, language } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { setHidden } = useNavVisibility()

  const [minutes, setMinutes] = useState(15)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [remaining, setRemaining] = useState(0)
  const [interruptions, setInterruptions] = useState(0)
  const [finished, setFinished] = useState<{ seconds: number; interruptions: number } | null>(
    null,
  )

  const [canSilence, setCanSilence] = useState(false)
  const [repaired, setRepaired] = useState(false)

  /*
   * The end time, not a countdown that ticks down.
   *
   * A per-second decrement drifts and, worse, stops entirely while the screen is off
   * — so a member who pockets the phone mid-prayer would come back to a timer that
   * had barely moved. Anchoring to a wall-clock deadline makes the display a
   * function of real time, which is what someone praying actually experiences.
   */
  const endsAt = useRef<number | null>(null)
  const running = sessionId !== null

  /*
   * Read by the repair check, which runs whenever this tab regains focus — including
   * when a member switches to Devotions mid-prayer and comes back. Without this it
   * would cheerfully un-silence the phone underneath a session that is still going.
   */
  const runningRef = useRef(false)
  runningRef.current = running

  useFocusEffect(
    useCallback(() => {
      setCanSilence(focus.canSilence())

      /*
       * The check that matters more than the feature.
       *
       * If a previous session ended by being killed — home button then a low-memory
       * reclaim, a swipe from recents an OEM did not report, a flat battery — the
       * phone may still be silenced. This notices and puts it back, and says so,
       * because a member who missed calls deserves to know why rather than to have
       * it quietly corrected.
       */
      if (!runningRef.current && focus.repair()) {
        log.info('focus', 'restored Do Not Disturb left on by an earlier session')
        setRepaired(true)
      }
    }, []),
  )

  /* The nav slides away for the length of a session, and comes back with it. */
  useEffect(() => {
    setHidden(running)
    return () => setHidden(false)
  }, [running, setHidden])

  const stop = useCallback(
    async (completed: boolean) => {
      const id = sessionId
      if (!id) return
      const total = minutes * 60
      const left = endsAt.current ? Math.max(0, (endsAt.current - Date.now()) / 1000) : 0
      const elapsed = completed ? total : total - left

      setSessionId(null)
      endsAt.current = null
      focus.endSession()
      setFinished({ seconds: elapsed, interruptions })

      await endSession(id, elapsed, completed, interruptions)
    },
    [sessionId, minutes, interruptions],
  )

  // The clock. A second is plenty; nothing here is animated frame by frame.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const left = endsAt.current ? (endsAt.current - Date.now()) / 1000 : 0
      setRemaining(Math.max(0, left))
      if (left <= 0) void stop(true)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [running, stop])

  /*
   * Leave-detection.
   *
   * This is the whole of what the spec promises on both platforms, and it is
   * deliberately modest: the app can tell it stopped being in front of you. It cannot
   * tell whether you took a call, checked a message, or put the phone down to kneel.
   * So it counts, and says how many times, and draws no conclusion.
   */
  useEffect(() => {
    if (!running) return
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') setInterruptions((n) => n + 1)
    })
    return () => sub.remove()
  }, [running])

  const begin = async () => {
    setFinished(null)
    setRepaired(false)
    setInterruptions(0)
    endsAt.current = Date.now() + minutes * 60 * 1000
    setRemaining(minutes * 60)
    // The service owns the session from here: it holds the deadline, silences the
    // phone, and restores it whatever becomes of this JavaScript.
    focus.beginSession(minutes * 60 * 1000)
    setSessionId(await startSession())
  }

  const f = fonts(language)
  const progress = running ? 1 - remaining / (minutes * 60) : 0
  const clock = mmss(running ? remaining : minutes * 60)

  return (
    <View style={styles.screen}>
      <InkBackdrop variant="focus" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('back')}
        hitSlop={10}
        style={[styles.close, { top: insets.top }]}
        onPress={() => router.replace('/')}
      >
        <Text style={styles.closeGlyph}>✕</Text>
      </Pressable>

      {/* Session history and totals live one tap away, not on the screen someone
          opens to sit still for a few minutes. */}
      {!running && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('focusHistory')}
          hitSlop={10}
          style={[styles.info, { top: insets.top }]}
          onPress={() => router.push('/focus-history')}
        >
          <Icon name="info" size={19} colour="#d5e0b5" />
        </Pressable>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.page,
          {
            paddingTop: insets.top + 2,
            paddingBottom: insets.bottom + theme.layout.navClearance,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Kicker
          language={language}
          size={12}
          tracking={3}
          colour={theme.color.onInkSecondary}
          style={styles.kicker}
        >
          {t('focusWord')} · {minutes} {t('minShort')}
        </Kicker>
        <Text
          style={[
            styles.quote,
            { fontFamily: f.italic, lineHeight: lineHeightFor(language, 15) },
          ]}
        >
          {t('focusQuote')}
        </Text>

        <View style={styles.clockBlock}>
          {/*
           * The timer is drawn as vector text so it can carry a gradient. React Native
           * cannot fill glyphs with anything but a flat colour, and this number is the
           * whole screen — a flat lime would be a different design, not a smaller one.
           */}
          <Svg width="100%" height={132} viewBox="0 0 366 132">
            <Defs>
              <LinearGradient id="timer" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#EAF4C0" />
                <Stop offset="0.55" stopColor="#A9C86A" />
                <Stop offset="1" stopColor="#5E7E33" />
              </LinearGradient>
            </Defs>
            <SvgText
              x="183"
              y="110"
              textAnchor="middle"
              fontSize="138"
              fontFamily={f.numeric}
              fill="url(#timer)"
            >
              {clock}
            </SvgText>
          </Svg>

          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          {running && interruptions > 0 && (
            <Text style={[styles.away, { fontFamily: f.ui }]}>
              {t('focusSteppedAway')} {interruptions}
            </Text>
          )}
        </View>

        {!running && (
          <View style={styles.presets}>
            {PRESETS.map((m) => {
              const on = m === minutes
              return (
                <Pressable
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setMinutes(m)}
                  style={[styles.preset, on && styles.presetOn]}
                >
                  <Text
                    style={[
                      styles.presetText,
                      { fontFamily: f.label },
                      on && styles.presetTextOn,
                    ]}
                  >
                    {m} {t('minShort')}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        )}

        <View style={styles.controls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('retry')}
            style={styles.side}
            onPress={() => {
              if (running) void stop(false)
              setFinished(null)
            }}
          >
            <Text style={styles.sideGlyph}>↺</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={running ? t('focusEnd') : t('focusBegin')}
            style={styles.play}
            onPress={() => (running ? void stop(false) : void begin())}
          >
            {/* The light comes from the upper left, as it does on every lime surface. */}
            <Svg width={84} height={84} style={StyleSheet.absoluteFill}>
              <Defs>
                <RNRadialGradient id="play" cx="0.38" cy="0.3" r="0.85">
                  <Stop offset="0" stopColor="#D9E8A8" />
                  <Stop offset="0.6" stopColor="#8FB052" />
                  <Stop offset="1" stopColor="#5E7E33" />
                </RNRadialGradient>
              </Defs>
              <Circle cx="42" cy="42" r="42" fill="url(#play)" />
            </Svg>
            <Text style={[styles.playGlyph, { fontFamily: f.labelStrong }]}>
              {running ? '■' : '▶'}
            </Text>
          </Pressable>

          <View style={styles.side} />
        </View>

        {/*
          Restored, and said out loud. A member who missed calls because a session
          never ended is owed the reason, not a silent correction.
        */}
        {repaired && !running && (
          <View style={styles.card}>
            <Text style={[styles.cardBody, { fontFamily: f.body }]}>{t('focusRestored')}</Text>
          </View>
        )}

        {/* {!running && focus.canBlock() && !canSilence && (
          <Pressable
            accessibilityRole="button"
            style={styles.card}
            onPress={() => focus.openSettings()}
          >
            <Kicker language={language} size={9.5} colour={theme.color.onInkSecondary}>
              {t('focusAllowTitle')}
            </Kicker>
            <Text style={[styles.cardBody, { fontFamily: f.body }]}>{t('focusAllowBody')}</Text>
          </Pressable>
        )} */}

        {/*
          Said once, afterwards, without judgement. "You stepped away twice" is a
          mirror; "you failed to focus" would be a scold, and this is prayer.
        */}
        {finished && !running && (
          <View style={styles.card}>
            <Kicker language={language} size={9.5} colour={theme.color.accentBright}>
              {t('focusDone')} · {mmss(finished.seconds)}
            </Kicker>
            <Text style={[styles.cardBody, { fontFamily: f.body }]}>
              {finished.interruptions === 0
                ? t('focusUninterrupted')
                : `${t('focusSteppedAway')} ${finished.interruptions}`}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.inkDarkest },
  /* Grows to fill the screen so the timer can take the middle, as the design has it. */
  page: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24 },

  close: {
    position: 'absolute',
    left: 22,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  closeGlyph: { fontSize: 20, lineHeight: 23, color: '#d5e0b5' },
  info: {
    position: 'absolute',
    right: 22,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,.08)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },

  kicker: { marginTop: 44 },
  quote: {
    marginTop: 6,
    fontSize: 15,
    color: theme.color.onInkDim,
    textAlign: 'center',
    maxWidth: 240,
  },

  clockBlock: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  bar: {
    width: 230,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,.1)',
    marginTop: 14,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3, backgroundColor: theme.color.accentBright },
  away: { marginTop: 10, fontSize: 11.5, color: theme.color.onInkDim },

  presets: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  preset: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(169,200,106,.4)',
    backgroundColor: 'rgba(255,255,255,.05)',
  },
  presetOn: { backgroundColor: 'rgba(169,200,106,.22)' },
  presetText: { fontSize: 14, color: theme.color.navIdle },
  presetTextOn: { color: theme.color.accentBright },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  side: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideGlyph: { fontSize: 18, lineHeight: 21, color: '#d5e0b5' },
  play: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...theme.shadow.cta,
  },
  playFill: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.color.accentMid },
  playGlyph: { fontSize: 26, lineHeight: 30, color: '#1a230c' },

  card: {
    alignSelf: 'stretch',
    marginTop: 26,
    padding: 16,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.06)',
    gap: 6,
  },
  cardBody: { fontSize: 14, color: theme.color.onInkSecondary },
})
