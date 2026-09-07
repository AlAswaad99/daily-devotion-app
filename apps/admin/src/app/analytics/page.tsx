'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { RequireAdmin } from '../../components/RequireAdmin'
import { Icon } from '../../components/Icon'
import { AreaChart, BarsLine, Columns, HBars, Sparkline, SplitBar, SERIES } from '../../components/charts'

interface Health {
  members: number
  runway_days: number
}

interface Engagement {
  scheduled_date: string
  completions: number
  reflections_written: number
}

interface DropOff {
  book_id: string
  book_title_en: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  scheduled_date: string
  readers: number
}

interface Bucket {
  bucket: string
  members: number
}

interface Membership {
  joined_on: string
  joined: number
  amharic: number
  english: number
}

interface OptOut {
  kind: string
  enabled_globally: boolean
  opted_out: number
  members: number
}

const RANGES = [7, 14, 30, 90] as const
type Range = (typeof RANGES)[number]

const iso = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10)

/**
 * The window and the window before it, in one trip.
 *
 * Every delta on this page compares like with like — the last 30 days against the
 * 30 before them — which is the only comparison that survives a ministry whose
 * membership is still growing.
 */
async function fetchAnalytics(range: Range) {
  const [health, current, prior, dropoff, streaks, membership, optouts] = await Promise.all([
    db.rpc('content_health'),
    db.rpc('ministry_engagement', { p_from: iso(range - 1), p_to: iso(0) }),
    db.rpc('ministry_engagement', { p_from: iso(range * 2 - 1), p_to: iso(range) }),
    db.rpc('ministry_dropoff'),
    db.rpc('ministry_streaks'),
    db.rpc('ministry_membership'),
    db.rpc('notification_optouts'),
  ])

  return {
    health: (health.data as Health[] | null)?.[0] ?? null,
    current: (current.data as Engagement[] | null) ?? [],
    prior: (prior.data as Engagement[] | null) ?? [],
    dropoff: (dropoff.data as DropOff[] | null) ?? [],
    streaks: (streaks.data as Bucket[] | null) ?? [],
    membership: (membership.data as Membership[] | null) ?? [],
    optouts: (optouts.data as OptOut[] | null) ?? [],
  }
}

export default function Analytics() {
  return (
    <RequireAdmin>
      <AnalyticsInner />
    </RequireAdmin>
  )
}

function mean(values: number[]): number {
  return values.length ? values.reduce((n, v) => n + v, 0) / values.length : 0
}

function Delta({ now, before, unit = '%' }: { now: number; before: number; unit?: string }) {
  if (before === 0) return <span className="delta flat">new</span>
  const change = unit === 'pts' ? now - before : ((now - before) / before) * 100
  const tone = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat'
  const arrow = tone === 'up' ? '▲' : tone === 'down' ? '▼' : '±'
  return (
    <span className={`delta ${tone}`}>
      {arrow} {Math.abs(change).toFixed(1)} {unit === 'pts' ? 'pts' : '%'}
    </span>
  )
}

function AnalyticsInner() {
  const [range, setRange] = useState<Range>(30)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchAnalytics>> | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (next: Range) => {
    setLoading(true)
    const rows = await fetchAnalytics(next)
    setData(rows)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await fetchAnalytics(range)
      if (!cancelled) {
        setData(rows)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // The range control calls `load` itself; this effect is the first paint only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!data) return <p className="muted">Loading…</p>
  const { health, current, prior, dropoff, streaks, membership, optouts } = data

  const members = Number(health?.members ?? 0)
  const series = current.map((row) => ({
    label: row.scheduled_date.slice(5),
    a: Number(row.completions),
    b: Number(row.reflections_written),
  }))

  const activeNow = mean(series.map((r) => r.a))
  const activeBefore = mean(prior.map((r) => Number(r.completions)))
  const completionNow = members ? (activeNow / members) * 100 : 0
  const completionBefore = members ? (activeBefore / members) * 100 : 0

  const completions = series.reduce((n, r) => n + r.a, 0)
  const reflections = series.reduce((n, r) => n + (r.b ?? 0), 0)
  const priorCompletions = prior.reduce((n, r) => n + Number(r.completions), 0)
  const priorReflections = prior.reduce((n, r) => n + Number(r.reflections_written), 0)
  const reflectionNow = completions ? (reflections / completions) * 100 : 0
  const reflectionBefore = priorCompletions ? (priorReflections / priorCompletions) * 100 : 0

  const byBucket = new Map(streaks.map((b) => [b.bucket, Number(b.members)]))
  const pastWeek =
    (byBucket.get('8-14') ?? 0) + (byBucket.get('15-30') ?? 0) + (byBucket.get('30+') ?? 0)
  const streakTotal = streaks.reduce((n, b) => n + Number(b.members), 0)

  const best = series.reduce((top, r) => (r.a > top.a ? r : top), { label: '—', a: 0, b: 0 })
  const worst = series.reduce((low, r) => (r.a < low.a ? r : low), series[0] ?? { label: '—', a: 0, b: 0 })

  const sortedJoins = [...membership].sort((a, b) => a.joined_on.localeCompare(b.joined_on))
  // `ministry_membership` returns joins per date; the chart wants the running total.
  const growth = sortedJoins.reduce<number[]>(
    (acc, row) => [...acc, (acc.at(-1) ?? 0) + Number(row.joined)],
    [],
  )
  const amharic = membership.reduce((n, r) => n + Number(r.amharic), 0)
  const english = membership.reduce((n, r) => n + Number(r.english), 0)
  const languageTotal = amharic + english

  const books = [...new Set(dropoff.map((r) => r.book_id))]
  const readerPeak = Math.max(members, ...dropoff.map((r) => Number(r.readers)), 1)

  const mutedRungs = [...optouts].sort((a, b) => Number(b.opted_out) - Number(a.opted_out))
  /*
   * Ranked against the most-muted rung, not against the membership.
   *
   * Drawn against everyone, a handful of opt-outs is an invisible sliver; drawn
   * against a fixed fraction, anything above that fraction pins to full width and
   * the two worst rungs become indistinguishable. Scaling to the largest value
   * keeps the ranking readable at either extreme, and the per-cent column beside it
   * carries the absolute size the bar no longer states.
   */
  const optScale = Math.max(...mutedRungs.map((r) => Number(r.opted_out)), 1)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="page-sub">
            How the ministry is reading. Every figure is a count returned by an
            admin-gated database function &mdash; no reflection text is readable here,
            by design.
          </p>
        </div>
        <div className="head-actions">
          <button>
            <Icon name="download" size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{ padding: '9px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}
      >
        <div className="seg">
          {RANGES.map((r) => (
            <button
              key={r}
              aria-pressed={range === r}
              onClick={() => {
                setRange(r)
                void load(r)
              }}
            >
              {r}d
            </button>
          ))}
        </div>
        <span style={{ width: 1, height: 20, background: 'var(--line)' }} />
        <span className="faint mono" style={{ fontSize: 11 }}>
          {iso(range - 1)} → {iso(0)}
        </span>
        <span className="faint" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
          {loading ? 'Refreshing…' : `Compared with the ${range} days before`}
        </span>
      </div>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="card kpi">
          <div className="kpi-label">Daily active readers</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div className="kpi-value">{activeNow.toFixed(1)}</div>
            <Sparkline values={series.map((r) => r.a)} />
          </div>
          <div className="kpi-foot">
            <Delta now={activeNow} before={activeBefore} /> avg / day vs. {activeBefore.toFixed(1)} prior
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Completion rate</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div className="kpi-value">
              {completionNow.toFixed(1)}
              <span className="unit">%</span>
            </div>
            <Sparkline values={series.map((r) => (members ? (r.a / members) * 100 : 0))} />
          </div>
          <div className="kpi-foot">
            <Delta now={completionNow} before={completionBefore} unit="pts" /> of {members} members,
            per scheduled day
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Reflection rate</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div className="kpi-value">
              {reflectionNow.toFixed(1)}
              <span className="unit">%</span>
            </div>
            <Sparkline values={series.map((r) => r.b ?? 0)} />
          </div>
          <div className="kpi-foot">
            <Delta now={reflectionNow} before={reflectionBefore} unit="pts" />{' '}
            {mean(series.map((r) => r.b ?? 0)).toFixed(1)} written per day
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Members past 7 days</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="kpi-value">{pastWeek}</div>
          </div>
          <div className="kpi-foot">
            {streakTotal ? `${((pastWeek / streakTotal) * 100).toFixed(1)}%` : '0%'} on a streak longer
            than a week
          </div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2 className="card-title">Reads and reflections</h2>
          <span className="legend" style={{ marginLeft: 6 }}>
            <span>
              <i style={{ background: SERIES[0] }} />
              Days completed
            </span>
            <span>
              <i style={{ background: SERIES[1] }} />
              Reflections written
            </span>
          </span>
          <span className="card-note" style={{ marginLeft: 'auto' }}>
            One shared axis &mdash; both series count people
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 18, alignItems: 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BarsLine
              data={series}
              width={880}
              height={210}
              barWidth={series.length > 20 ? 15 : 22}
              labelEvery={series.length > 20 ? 3 : 2}
            />
          </div>
          <div
            style={{
              width: 168,
              flex: 'none',
              borderLeft: '1px solid var(--line)',
              paddingLeft: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <div className="eyebrow">Best day</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                {best.a}{' '}
                <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>
                  {best.label}
                </span>
              </div>
            </div>
            <div>
              <div className="eyebrow">Quietest day</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                {worst.a}{' '}
                <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}>
                  {worst.label}
                </span>
              </div>
            </div>
            <div>
              <div className="eyebrow">Days in range</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
                {series.length}
                <span className="faint" style={{ fontSize: 11, fontWeight: 400 }}> scheduled</span>
              </div>
              <div className="faint" style={{ fontSize: 11 }}>
                A date with no devotion is simply absent
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2 className="card-title">Drop-off within each book</h2>
          <span className="card-note">
            readers per day &mdash; the number most likely to change what gets written next
          </span>
          <span className="legend" style={{ marginLeft: 'auto' }}>
            <span>
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M5 1l4 7H1z" fill="var(--warn)" />
              </svg>{' '}
              summary day
            </span>
          </span>
        </div>
        <div className="card-body">
          {books.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No published days yet.
            </p>
          ) : (
            <div
              className="cols"
              style={{ gridTemplateColumns: `repeat(${Math.min(books.length, 3)}, minmax(0, 1fr))`, gap: 22 }}
            >
              {books.map((bookId) => {
                const days = dropoff.filter((r) => r.book_id === bookId)
                const first = Number(days[0]?.readers ?? 0)
                const last = Number(days.at(-1)?.readers ?? 0)
                const fell = first > 0 ? Math.round(((first - last) / first) * 100) : 0
                return (
                  <div key={bookId}>
                    <div className="spread" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
                      <div
                        style={{
                          minWidth: 0,
                          fontSize: 12.5,
                          fontWeight: 600,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {days[0]?.book_title_en}
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
                          {first} → {last}
                        </div>
                        {fell > 0 && (
                          <div className="mono" style={{ fontSize: 10.5, color: 'var(--crit)' }}>
                            −{fell}%
                          </div>
                        )}
                      </div>
                    </div>
                    <Columns
                      values={days.map((d) => Number(d.readers))}
                      summaryAt={days.map((d, i) => (d.kind === 'summary' ? i : -1)).filter((i) => i >= 0)}
                      titles={days.map((d) => `Day ${d.day_number}: ${d.topic_en} — ${d.readers} reader(s)`)}
                      max={readerPeak}
                      height={76}
                    />
                    <div className="spread" style={{ marginTop: 4 }}>
                      <span className="mono faint" style={{ fontSize: 10 }}>
                        Day 1
                      </span>
                      <span className="mono faint" style={{ fontSize: 10 }}>
                        {days.length} days read
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Streak distribution</h2>
            <span className="card-note">{streakTotal} members, bucketed</span>
          </div>
          <div className="card-body">
            {streakTotal === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                No members yet.
              </p>
            ) : (
              <HBars
                width={470}
                labelWidth={72}
                valueWidth={78}
                barHeight={10}
                gap={15}
                rows={['none', '1-3', '4-7', '8-14', '15-30', '30+'].map((bucket) => {
                  const value = byBucket.get(bucket) ?? 0
                  const label =
                    bucket === 'none'
                      ? 'None'
                      : bucket === '30+'
                        ? '30+ days'
                        : `${bucket.replace('-', '–')} days`
                  return {
                    label,
                    value,
                    display: `${value}  ·  ${((value / streakTotal) * 100).toFixed(1)}%`,
                    ...(bucket === 'none' ? { color: '#ccd4dd' } : {}),
                  }
                })}
              />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Membership</h2>
            <span className="card-note">{languageTotal} members</span>
            <Link href="/users" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
              Members →
            </Link>
          </div>
          <div className="card-body">
            <AreaChart
              values={growth}
              width={470}
              height={126}
              labels={
                sortedJoins.length > 1
                  ? [sortedJoins[0]!.joined_on.slice(5), sortedJoins.at(-1)!.joined_on.slice(5)]
                  : []
              }
            />
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div className="spread" style={{ marginBottom: 7 }}>
                <span className="eyebrow">Reading language</span>
                <span className="legend">
                  <span>
                    <i style={{ background: SERIES[0] }} />
                    <span lang="am">አማርኛ</span>{' '}
                    {languageTotal ? Math.round((amharic / languageTotal) * 100) : 0}%
                  </span>
                  <span>
                    <i style={{ background: SERIES[1] }} />
                    English {languageTotal ? Math.round((english / languageTotal) * 100) : 0}%
                  </span>
                </span>
              </div>
              <SplitBar
                width={470}
                height={26}
                parts={[
                  { value: amharic, color: SERIES[0], label: 'Amharic' },
                  { value: english, color: SERIES[1], label: 'English' },
                ]}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Notification opt-outs</h2>
          <span className="card-note">members who switched a rung off</span>
          <Link href="/notifications" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
            Notifications →
          </Link>
        </div>
        {mutedRungs.length === 0 ? (
          <div className="card-body">
            <p className="muted" style={{ margin: 0 }}>
              Nobody has switched anything off.
            </p>
          </div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>Rung</th>
                  <th>Share of members opted out</th>
                  <th className="r">Off</th>
                  <th className="r">%</th>
                </tr>
              </thead>
              <tbody>
                {mutedRungs.map((rung) => {
                  const off = Number(rung.opted_out)
                  const total = Number(rung.members) || 1
                  const share = (off / total) * 100
                  const tone = share >= 17 ? 'crit' : share >= 9 ? 'warn' : ''
                  return (
                    <tr key={rung.kind}>
                      <td>
                        <div className="mono t-strong" style={{ fontSize: 12 }}>
                          {rung.kind}
                        </div>
                        {!rung.enabled_globally && (
                          <span className="pill draft" style={{ marginTop: 2 }}>
                            switched off for everyone
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${tone}`}
                            style={{ width: `${Math.min((off / optScale) * 100, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="r mono" style={{ fontSize: 12 }}>
                        {off}
                      </td>
                      <td className="r mono faint" style={{ fontSize: 11.5, width: '1%' }}>
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="card-foot faint">
              Bars are ranked against the most-muted rung, not against the membership; the
              per-cent column is of all {members} members.
            </div>
          </>
        )}
      </section>
    </>
  )
}
