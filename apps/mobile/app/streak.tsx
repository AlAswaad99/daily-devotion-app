import { eligibleRepairs, toEthiopic, type RepairRule } from '@abide/domain'
import { useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { alert } from '../src/lib/alert'
import { InkBackdrop } from '../src/components/Backdrop'
import { Flame } from '../src/components/Flame'
import { StreakCalendar, type CalendarCell } from '../src/components/StreakCalendar'
import { Kicker, Numeral, ScreenHeader, UiText } from '../src/components/ui'
import {
  getAllCompletions,
  getScheduledDays,
  serverStreak,
  type ServerStreak,
} from '../src/data/repository'
import { STREAK_COPY, fill, lineHeightFor } from '../src/lib/i18n'
import { useProfile } from '../src/lib/profile'
import { supabase } from '../src/lib/supabase'
import { fonts, theme } from '../src/lib/theme'
import { missedRun, streakState } from '../src/lib/v3-logic'
import { isOnline } from '../src/sync/sync'

interface DayRowData {
  id: string
  scheduled_date: string
}

interface CompletionRow {
  devotion_day_id: string
  method: 'live' | 'backfill' | 'repair'
}

type CellState = 'counted' | 'repaired' | 'backfilled' | 'missed' | 'future' | 'preJoin'

/**
 * The streak: a flame, a number, and the month it was kept in.
 *
 * The flame is the screen. It is drawn rather than typed — three rotated squares that
 * flicker out of phase — because the same shape has to carry three states: burning,
 * fading, and gone out with smoke rising off it. An emoji could carry one.
 */
export default function Streak() {
  const { profile, streak, today, language, t, refresh, sync } = useProfile()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [days, setDays] = useState<DayRowData[]>([])
  const [completions, setCompletions] = useState<CompletionRow[]>([])
  const [server, setServer] = useState<ServerStreak | null>(null)
  const [online, setOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null)

  // Local reads only: the calendar is as complete offline as it is online.
  const load = useCallback(async () => {
    const [scheduled, done, cached, connected] = await Promise.all([
      getScheduledDays(),
      getAllCompletions(),
      serverStreak(),
      isOnline(),
    ])
    setDays(scheduled.map((d) => ({ id: d.id, scheduled_date: d.date })))
    setCompletions(done.map((c) => ({ devotion_day_id: c.devotion_day_id, method: c.method })))
    setServer(cached)
    setOnline(connected)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (today && !month) {
      const ec = toEthiopic(today)
      setMonth({ year: ec.year, month: ec.month })
    }
  }, [today, month])

  const byDate = useMemo(() => {
    const methods = new Map(completions.map((c) => [c.devotion_day_id, c.method]))
    const map = new Map<string, CalendarCell>()
    for (const day of days) {
      const method = methods.get(day.id)
      const state: CellState =
        profile && day.scheduled_date < profile.joined_on
          ? 'preJoin'
          : method === 'repair'
            ? 'repaired'
            : method === 'backfill'
              ? 'backfilled'
              : method === 'live'
                ? 'counted'
                : today && day.scheduled_date >= today
                  ? 'future'
                  : 'missed'
      map.set(day.scheduled_date, { id: day.id, state })
    }
    return map
  }, [days, completions, profile, today])

  /** The most recent miss is the one a repair offer should be about. */
  const mostRecentMiss = useMemo(() => {
    const missed = [...byDate.entries()]
      .filter(([, cell]) => cell.state === 'missed')
      .sort(([a], [b]) => b.localeCompare(a))
    return missed[0] ?? null
  }, [byDate])

  const todayComplete = today ? byDate.get(today)?.state === 'counted' : false

  // Repair spends something the server owns, so it is the one action that cannot
  // happen offline. Offering it and then failing would be worse than not offering.
  const offers: RepairRule[] = useMemo(() => {
    if (!online) return []
    if (!profile || !streak || !today || !mostRecentMiss) return []
    return eligibleRepairs({
      user: { id: profile.id } as never,
      missedDate: mostRecentMiss[0] as never,
      today: today as never,
      now: new Date().toISOString() as never,
      state: {
        userId: profile.id as never,
        current: streak.current,
        best: streak.best,
        lastCountedDate: streak.lastCountedDate as never,
        repairCredits: server?.repair_credits ?? 0,
      },
      todayComplete,
    })
  }, [online, profile, streak, today, mostRecentMiss, todayComplete, server])

  const applyRepair = useCallback(
    async (rule: RepairRule) => {
      if (!mostRecentMiss) return
      setBusy(true)
      const { error } = await supabase.rpc('repair_day', {
        p_day: mostRecentMiss[1].id,
        p_rule: rule.key,
      })
      setBusy(false)

      if (error) {
        // The server has the final say; if it refuses, show why rather than
        // pretending the optimistic offer was right.
        alert(t('repair'), error.message)
        await refresh()
        await load()
        return
      }
      await sync({ force: true })
      await load()
    },
    [mostRecentMiss, sync, load, refresh, t],
  )

  if (loading || !month || !profile) {
    return (
      <View style={styles.centered}>
        <InkBackdrop variant="streak" />
        <ActivityIndicator color={theme.color.accentBright} />
      </View>
    )
  }

  const f = fonts(language)
  const currentMonth = today
    ? { year: toEthiopic(today).year, month: toEthiopic(today).month }
    : month
  const totalCounted = completions.filter((c) => c.method !== 'backfill').length
  const state = streakState(streak)
  const count = streak?.current ?? 0
  const copy = STREAK_COPY[language][state]
  const missed = missedRun(streak, today)
  const countColour =
    state === 'strong' ? theme.color.flame : state === 'low' ? '#D8A85C' : '#7c8a70'

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
          kicker={t('myStreak')}
          language={language}
          variant="translucent"
          backLabel={t('back')}
          onBack={() => router.back()}
        />

        <View style={styles.flameBlock}>
          <Flame state={state} size={120} />
        </View>

        <View style={styles.countBlock}>
          <Numeral language={language} size={92} colour={countColour}>
            {count}
          </Numeral>
          <Kicker
            language={language}
            tracking={theme.tracking.kickerWide}
            colour={theme.color.onInkSecondary}
            style={styles.countLabel}
          >
            {t('dayStreak')}
          </Kicker>

          <Text
            style={[
              styles.message,
              { fontFamily: f.italic, lineHeight: lineHeightFor(language, 19) },
            ]}
          >
            {fill(copy.msg, { count, missed })}
          </Text>
          <Text
            style={[
              styles.sub,
              { fontFamily: f.ui, lineHeight: lineHeightFor(language, 12.5) },
            ]}
          >
            {fill(copy.sub, { count, missed })}
          </Text>
        </View>

        <View style={styles.tiles}>
          <Tile
            value={Math.max(streak?.best ?? 0, server?.best ?? 0)}
            label={t('bestStreakLabel')}
            language={language}
          />
          <Tile value={totalCounted} label={t('devotionsLabel')} language={language} />
        </View>

        {!online && (
          <UiText
            language={language}
            size={12.5}
            colour={theme.color.onInkDim}
            style={styles.offline}
          >
            {t('offline')}
          </UiText>
        )}

        {/* Repair is offered here, and only when a rule says it is really available. */}
        {mostRecentMiss && offers.length > 0 && (
          <></>
          // <View style={styles.repair}>
          //   <Kicker language={language} colour={theme.color.flame}>
          //     {t('repairTitle')}
          //   </Kicker>
          //   <Text
          //     style={[
          //       styles.repairBody,
          //       { fontFamily: f.body, lineHeight: lineHeightFor(language, 13.5) },
          //     ]}
          //   >
          //     {t('repairBody', { date: formatEthiopic(mostRecentMiss[0], language) })}
          //   </Text>
          //   {offers.map((rule) => {
          //     const cost = rule.cost({
          //       user: { id: profile.id } as never,
          //       missedDate: mostRecentMiss[0] as never,
          //       today: today as never,
          //       now: new Date().toISOString() as never,
          //       state: {
          //         userId: profile.id as never,
          //         current: streak?.current ?? 0,
          //         best: streak?.best ?? 0,
          //         lastCountedDate: (streak?.lastCountedDate ?? null) as never,
          //         repairCredits: server?.repair_credits ?? 0,
          //       },
          //       todayComplete,
          //     })
          //     return (
          //       <Pressable
          //         accessibilityRole="button"
          //         key={rule.key}
          //         style={styles.repairButton}
          //         disabled={busy}
          //         onPress={() => void applyRepair(rule)}
          //       >
          //         <Text style={[styles.repairButtonText, { fontFamily: f.label }]}>
          //           {language === 'am' ? rule.labelAm : rule.labelEn}
          //         </Text>
          //         {/* The cost is always shown before the user commits. */}
          //         {cost && (
          //           <Text style={[styles.repairCost, { fontFamily: f.ui }]}>
          //             {language === 'am' ? cost.descriptionAm : cost.descriptionEn}
          //           </Text>
          //         )}
          //       </Pressable>
          //     )
          //   })}
          //   <Pressable
          //     accessibilityRole="button"
          //     style={styles.repairSecondary}
          //     onPress={() => router.push(`/day/${mostRecentMiss[1].id}`)}
          //   >
          //     <Text style={[styles.repairSecondaryText, { fontFamily: f.label }]}>
          //       {t('backfillOnly')}
          //     </Text>
          //   </Pressable>
          // </View>
        )}

        <View style={styles.calendarCard}>
          <StreakCalendar
            month={month}
            onMonth={setMonth}
            currentMonth={currentMonth}
            cells={byDate}
            today={today}
            language={language}
            onOpenDay={(id) => router.push(`/day/${id}`)}
          />
        </View>
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
      <Kicker
        language={language}
        size={9.5}
        colour={theme.color.onInkSecondary}
        style={styles.tileLabel}
      >
        {label}
      </Kicker>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.inkDarkest },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },

  flameBlock: {
    height: 172,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  countBlock: { alignItems: 'center', paddingHorizontal: 20 },
  countLabel: { marginTop: 4 },
  message: {
    marginTop: 14,
    fontSize: 19,
    color: theme.color.onInkBright,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  sub: {
    marginTop: 6,
    fontSize: 12.5,
    color: theme.color.onInkMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  tiles: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 20 },
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

  offline: { textAlign: 'center', marginTop: 14 },

  repair: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 18,
    borderRadius: theme.radius.lg,
    backgroundColor: 'rgba(246,188,69,.12)',
    borderWidth: 1,
    borderColor: 'rgba(246,188,69,.28)',
    gap: 10,
  },
  repairBody: { fontSize: 13.5, color: theme.color.onInkSecondary },
  repairButton: {
    backgroundColor: theme.color.flame,
    borderRadius: theme.radius.md,
    padding: 14,
    gap: 2,
  },
  repairButtonText: { fontSize: 14, color: theme.color.inkDeep },
  repairCost: { fontSize: 11.5, color: theme.color.inkDeep, opacity: 0.9 },
  repairSecondary: { alignItems: 'center', paddingVertical: 4 },
  repairSecondaryText: { fontSize: 13, color: theme.color.flame },

  calendarCard: {
    marginHorizontal: 20,
    marginTop: 14,
    paddingTop: 16,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: theme.radius.calendar,
    backgroundColor: 'rgba(255,255,255,.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.06)',
  },
})
