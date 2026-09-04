import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  eligibleRepairs, formatEthiopic, toEthiopic, type RepairRule,
} from '@abide/domain'
import { InkBackdrop } from '../src/components/Backdrop'
import { StreakCalendar, type CalendarCell } from '../src/components/StreakCalendar'
import { supabase } from '../src/lib/supabase'
import { useProfile } from '../src/lib/profile'
import {
  getAllCompletions, getScheduledDays, serverStreak, type ServerStreak,
} from '../src/data/repository'
import { isOnline } from '../src/sync/sync'
import { fonts, theme } from '../src/lib/theme'

interface DayRow {
  id: string
  scheduled_date: string
}

interface CompletionRow {
  devotion_day_id: string
  method: 'live' | 'backfill' | 'repair'
}

type CellState = 'counted' | 'repaired' | 'backfilled' | 'missed' | 'future' | 'preJoin'

export default function Streak() {
  const { profile, streak, today, language, t, refresh, sync } = useProfile()
  const router = useRouter()

  const [days, setDays] = useState<DayRow[]>([])
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
    setCompletions(
      done.map((c) => ({ devotion_day_id: c.devotion_day_id, method: c.method })),
    )
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
    const map = new Map<string, { id: string; state: CellState }>()
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
                : today && day.scheduled_date > today
                  ? 'future'
                  : today && day.scheduled_date === today
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
      const { data, error } = await supabase.rpc('repair_day', {
        p_day: mostRecentMiss[1].id,
        p_rule: rule.key,
      })
      setBusy(false)

      if (error) {
        // The server has the final say; if it refuses, show why rather than
        // pretending the optimistic offer was right.
        Alert.alert(t('repair'), error.message)
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
        <ActivityIndicator />
      </View>
    )
  }

  const currentMonth = today
    ? { year: toEthiopic(today).year, month: toEthiopic(today).month }
    : month
  const totalCounted = completions.filter((c) => c.method !== 'backfill').length
  const f = fonts(language)

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <InkBackdrop variant="streak" />
      <View style={styles.flameBlock}>
        <Text style={styles.flame}>{(streak?.current ?? 0) > 0 ? '🔥' : '·'}</Text>
        <Text style={[styles.count, { fontFamily: f.numeric }]}>{streak?.current ?? 0}</Text>
        <Text style={[styles.countLabel, { fontFamily: f.label }]}>
          {(streak?.current ?? 0) > 0 ? t('currentStreak') : t('noStreakYet')}
        </Text>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={[styles.tileValue, { fontFamily: f.numeric }]}>{Math.max(streak?.best ?? 0, server?.best ?? 0)}</Text>
          <Text style={[styles.tileLabel, { fontFamily: f.label }]}>{t('bestStreak')}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={[styles.tileValue, { fontFamily: f.numeric }]}>{totalCounted}</Text>
          <Text style={[styles.tileLabel, { fontFamily: f.label }]}>{t('totalDays')}</Text>
        </View>
      </View>

      {!online && <Text style={[styles.offline, { fontFamily: f.body }]}>{t('offline')}</Text>}

      {/* Repair is offered here, and only when a rule says it is really available. */}
      {mostRecentMiss && offers.length > 0 && (
        <View style={styles.repairCard}>
          <Text style={[styles.repairTitle, { fontFamily: f.label }]}>{t('repairTitle')}</Text>
          <Text style={[styles.repairBody, { fontFamily: f.body }]}>
            {t('repairBody', { date: formatEthiopic(mostRecentMiss[0], language) })}
          </Text>
          {offers.map((rule) => {
            const cost = rule.cost({
              user: { id: profile.id } as never,
              missedDate: mostRecentMiss[0] as never,
              today: today as never,
              now: new Date().toISOString() as never,
              state: {
                userId: profile.id as never,
                current: streak?.current ?? 0,
                best: streak?.best ?? 0,
                lastCountedDate: (streak?.lastCountedDate ?? null) as never,
                repairCredits: server?.repair_credits ?? 0,
              },
              todayComplete,
            })
            return (
              <Pressable accessibilityRole="button"
                key={rule.key}
                style={styles.repairButton}
                disabled={busy}
                onPress={() => void applyRepair(rule)}
              >
                <Text style={[styles.repairButtonText, { fontFamily: f.label }]}>
                  {language === 'am' ? rule.labelAm : rule.labelEn}
                </Text>
                {/* The cost is always shown before the user commits. */}
                {cost && (
                  <Text style={[styles.repairCost, { fontFamily: f.body }]}>
                    {language === 'am' ? cost.descriptionAm : cost.descriptionEn}
                  </Text>
                )}
              </Pressable>
            )
          })}
          <Pressable accessibilityRole="button"
            style={styles.repairSecondary}
            onPress={() => router.push(`/day/${mostRecentMiss[1].id}`)}
          >
            <Text style={[styles.repairSecondaryText, { fontFamily: f.body }]}>{t('backfillOnly')}</Text>
          </Pressable>
        </View>
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
  )
}


const styles = StyleSheet.create({
  /* Ink: Streak is a ritual screen, not a reading one. */
  screen: { flex: 1, backgroundColor: theme.color.inkDarkest },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: theme.layout.screenPadding,
    paddingTop: theme.layout.safeTop + theme.space(2),
    paddingBottom: theme.space(6),
    gap: theme.space(3),
  },

  flameBlock: { alignItems: 'center', gap: theme.space(0.5) },
  flame: { fontSize: 56 },
  count: { fontSize: 64, lineHeight: 68, color: theme.color.flame },
  countLabel: {
    fontSize: theme.size.kicker,
    color: theme.color.onInkSecondary,
    textTransform: 'uppercase',
    letterSpacing: theme.tracking.kicker,
  },

  tiles: { flexDirection: 'row', gap: theme.space(1.5) },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,.06)',
    borderRadius: theme.radius.md,
    paddingVertical: theme.space(2),
    alignItems: 'center',
    gap: 2,
  },
  tileValue: { fontSize: 30, lineHeight: 34, color: theme.color.onInk },
  tileLabel: {
    fontSize: theme.size.kicker,
    letterSpacing: theme.tracking.kicker,
    color: theme.color.onInkDim,
    textTransform: 'uppercase',
  },

  offline: { textAlign: 'center', color: theme.color.onInkDim, fontSize: theme.size.label },

  repairCard: {
    backgroundColor: 'rgba(246,188,69,.12)',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(246,188,69,.28)',
    padding: theme.space(2.5),
    gap: theme.space(1.5),
  },
  repairTitle: { fontSize: theme.size.body, color: theme.color.flame },
  repairBody: { fontSize: theme.size.label, color: theme.color.onInkSecondary, lineHeight: 20 },
  repairButton: {
    backgroundColor: theme.color.flame,
    borderRadius: theme.radius.md,
    padding: theme.space(1.5),
    gap: 2,
  },
  repairButtonText: { color: theme.color.inkDeep },
  repairCost: { color: theme.color.inkDeep, fontSize: theme.size.micro, opacity: 0.9 },
  repairSecondary: { alignItems: 'center', paddingVertical: theme.space(0.5) },
  repairSecondaryText: { color: theme.color.flame, fontSize: theme.size.label },

  calendarCard: {
    backgroundColor: 'rgba(255,255,255,.05)',
    borderRadius: theme.radius.lg,
    padding: theme.space(2),
  },
})
