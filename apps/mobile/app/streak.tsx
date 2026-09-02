import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native'
import { useRouter } from 'expo-router'
import {
  eligibleRepairs, ethiopicMonthDays, formatEthiopic, monthName, PAGUME, toEthiopic,
  type RepairRule,
} from '@abide/domain'
import { supabase } from '../src/lib/supabase'
import { useProfile } from '../src/lib/profile'
import {
  getAllCompletions, getScheduledDays, serverStreak, type ServerStreak,
} from '../src/data/repository'
import { isOnline } from '../src/sync/sync'
import { dayCellState, theme } from '../src/lib/theme'

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

  const cells = ethiopicMonthDays(month.year, month.month)
  const totalCounted = completions.filter((c) => c.method !== 'backfill').length

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.flameBlock}>
        <Text style={styles.flame}>{(streak?.current ?? 0) > 0 ? '🔥' : '·'}</Text>
        <Text style={styles.count}>{streak?.current ?? 0}</Text>
        <Text style={styles.countLabel}>
          {(streak?.current ?? 0) > 0 ? t('currentStreak') : t('noStreakYet')}
        </Text>
      </View>

      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{Math.max(streak?.best ?? 0, server?.best ?? 0)}</Text>
          <Text style={styles.tileLabel}>{t('bestStreak')}</Text>
        </View>
        <View style={styles.tile}>
          <Text style={styles.tileValue}>{totalCounted}</Text>
          <Text style={styles.tileLabel}>{t('totalDays')}</Text>
        </View>
      </View>

      {!online && <Text style={styles.offline}>{t('offline')}</Text>}

      {/* Repair is offered here, and only when a rule says it is really available. */}
      {mostRecentMiss && offers.length > 0 && (
        <View style={styles.repairCard}>
          <Text style={styles.repairTitle}>{t('repairTitle')}</Text>
          <Text style={styles.repairBody}>
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
                <Text style={styles.repairButtonText}>
                  {language === 'am' ? rule.labelAm : rule.labelEn}
                </Text>
                {/* The cost is always shown before the user commits. */}
                {cost && (
                  <Text style={styles.repairCost}>
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
            <Text style={styles.repairSecondaryText}>{t('backfillOnly')}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.monthHeader}>
        <Pressable accessibilityRole="button"
          onPress={() =>
            setMonth((m) =>
              m ? (m.month === 1 ? { year: m.year - 1, month: PAGUME } : { ...m, month: m.month - 1 }) : m,
            )
          }
        >
          <Text style={styles.monthNav}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>
          {monthName(month.month, language)} {month.year}
        </Text>
        <Pressable accessibilityRole="button"
          onPress={() =>
            setMonth((m) =>
              m ? (m.month === PAGUME ? { year: m.year + 1, month: 1 } : { ...m, month: m.month + 1 }) : m,
            )
          }
        >
          <Text style={styles.monthNav}>›</Text>
        </Pressable>
      </View>

      {/*
        Rows of the calendar's own shape rather than Gregorian weeks: twelve 30-day
        months lay out as six neat rows, and Pagume is left as the short partial row
        it actually is instead of being padded out.
      */}
      <View style={styles.grid}>
        {cells.map((cell) => {
          const entry = byDate.get(cell.iso)
          const state: CellState = entry?.state ?? 'future'
          const scheduled = entry !== undefined
          return (
            <Pressable accessibilityRole="button"
              key={cell.iso}
              disabled={!scheduled || state === 'future' || state === 'preJoin'}
              onPress={() => entry && router.push(`/day/${entry.id}`)}
              style={[
                styles.cell,
                { backgroundColor: scheduled ? dayCellState[state] : 'transparent' },
                !scheduled && styles.cellUnscheduled,
              ]}
            >
              <Text
                style={[
                  styles.cellText,
                  (state === 'counted' || state === 'repaired') && styles.cellTextOn,
                ]}
              >
                {cell.ethiopicDay}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.legend}>
        <Legend color={dayCellState.counted} label={t('completed')} />
        <Legend color={dayCellState.repaired} label={t('repaired')} />
        <Legend color={dayCellState.backfilled} label={t('backfilled')} />
        <Legend color={dayCellState.missed} label={t('missed')} />
        <Legend color={dayCellState.preJoin} label={t('beforeYouJoined')} />
      </View>
    </ScrollView>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  )
}

const CELL = 40

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: theme.space(3), paddingTop: theme.space(8), gap: theme.space(3) },
  flameBlock: { alignItems: 'center', gap: theme.space(0.5) },
  flame: { fontFamily: theme.font.body,
    fontSize: 56 },
  count: { fontFamily: theme.font.body,
    fontSize: 48, fontWeight: '800', color: theme.color.flame },
  countLabel: {
    fontFamily: theme.font.body,
    fontSize: theme.size.label,
    color: theme.color.inkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  tiles: { flexDirection: 'row', gap: theme.space(2) },
  tile: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.line,
    padding: theme.space(2),
    alignItems: 'center',
  },
  tileValue: { fontFamily: theme.font.body,
    fontSize: theme.size.display, fontWeight: '700', color: theme.color.ink },
  tileLabel: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
  offline: {
    textAlign: 'center',
    color: theme.color.inkMuted,
    fontFamily: theme.font.body,
    fontSize: theme.size.label,
  },
  repairCard: {
    backgroundColor: theme.color.accentSoft,
    borderRadius: theme.radius.lg,
    padding: theme.space(2.5),
    gap: theme.space(1.5),
  },
  repairTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.body, fontWeight: '700', color: theme.color.accent },
  repairBody: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.ink, lineHeight: 20 },
  repairButton: {
    backgroundColor: theme.color.accent,
    borderRadius: theme.radius.md,
    padding: theme.space(1.5),
    gap: 2,
  },
  repairButtonText: { color: theme.color.surface, fontWeight: '700' },
  repairCost: { color: theme.color.surface, fontFamily: theme.font.body,
    fontSize: theme.size.micro, opacity: 0.9 },
  repairSecondary: { alignItems: 'center', paddingVertical: theme.space(0.5) },
  repairSecondaryText: { color: theme.color.accent, fontFamily: theme.font.body,
    fontSize: theme.size.label },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: { fontFamily: theme.font.body,
    fontSize: theme.size.body, fontWeight: '700', color: theme.color.ink },
  monthNav: { fontFamily: theme.font.body,
    fontSize: 28, color: theme.color.inkMuted, paddingHorizontal: theme.space(2) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(1) },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellUnscheduled: { borderWidth: 1, borderColor: theme.color.line, opacity: 0.4 },
  cellText: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.ink },
  cellTextOn: { color: theme.color.surface, fontWeight: '700' },
  legend: { gap: theme.space(0.75), marginTop: theme.space(1) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: theme.space(1) },
  legendSwatch: { width: 14, height: 14, borderRadius: 4 },
  legendLabel: { fontFamily: theme.font.body,
    fontSize: theme.size.label, color: theme.color.inkMuted },
})
