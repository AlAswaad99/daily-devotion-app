'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db } from '../lib/db'
import { RequireAdmin } from '../components/RequireAdmin'
import { Icon, type IconName } from '../components/Icon'
import { BarsLine, Columns, HBars, Sparkline, SERIES } from '../components/charts'

interface Health {
  incomplete_days: number
  awaiting_review: number
  draft_books: number
  unscheduled_days: number
  last_scheduled: string | null
  runway_days: number
  members: number
  reference_problems: number
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

interface Revision {
  id: string
  entity_type: string
  entity_id: string
  status: string
  created_at: string
  author_id: string | null
}

async function fetchOverview() {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10)

  // All of these are counts-only functions. The dashboard has no way to read a
  // reflection, and these deliberately do not give it one.
  const [health, engagement, dropoff, streaks, revisions] = await Promise.all([
    db.rpc('content_health'),
    db.rpc('ministry_engagement', { p_from: from, p_to: to }),
    db.rpc('ministry_dropoff'),
    db.rpc('ministry_streaks'),
    db
      .from('content_revisions')
      .select('id, entity_type, entity_id, status, created_at, author_id')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const rows = (revisions.data as Revision[] | null) ?? []

  // Resolved with follow-up selects rather than an embed: `content_revisions` has
  // two foreign keys into `profiles`, so an unqualified join is ambiguous, and the
  // name of the constraint is not something this page should depend on.
  const authorIds = [...new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id))]
  const bookIds = rows.filter((r) => r.entity_type === 'book').map((r) => r.entity_id)
  const roundIds = rows.filter((r) => r.entity_type === 'round').map((r) => r.entity_id)

  const [authors, books, rounds] = await Promise.all([
    authorIds.length
      ? db.from('profiles').select('id, display_name').in('id', authorIds)
      : Promise.resolve({ data: [] }),
    bookIds.length
      ? db.from('books').select('id, title_en').in('id', bookIds)
      : Promise.resolve({ data: [] }),
    roundIds.length
      ? db.from('rounds').select('id, round_code').in('id', roundIds)
      : Promise.resolve({ data: [] }),
  ])

  const names = new Map<string, string>()
  for (const a of (authors.data as Array<{ id: string; display_name: string }> | null) ?? []) {
    names.set(a.id, a.display_name)
  }
  const entities = new Map<string, string>()
  for (const b of (books.data as Array<{ id: string; title_en: string }> | null) ?? []) {
    entities.set(b.id, b.title_en || '(untitled book)')
  }
  for (const r of (rounds.data as Array<{ id: string; round_code: string }> | null) ?? []) {
    entities.set(r.id, `Round ${r.round_code}`)
  }

  return {
    health: (health.data as Health[] | null)?.[0] ?? null,
    engagement: (engagement.data as Engagement[] | null) ?? [],
    dropoff: (dropoff.data as DropOff[] | null) ?? [],
    streaks: (streaks.data as Bucket[] | null) ?? [],
    revisions: rows,
    names,
    entities,
  }
}

export default function Overview() {
  return (
    <RequireAdmin>
      <OverviewInner />
    </RequireAdmin>
  )
}

const STATUS_VERB: Record<string, string> = {
  draft: 'saved a draft of',
  in_review: 'sent for review',
  published: 'published',
  archived: 'archived',
}

function OverviewInner() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchOverview>> | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await fetchOverview()
      if (!cancelled) setData(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!data) return <p className="muted">Loading…</p>
  const { health, engagement, dropoff, streaks, revisions, names, entities } = data

  const members = Number(health?.members ?? 0)
  const runway = Number(health?.runway_days ?? 0)
  const series = engagement.map((row) => ({
    label: row.scheduled_date.slice(5),
    a: Number(row.completions),
    b: Number(row.reflections_written),
  }))
  const readToday = series.at(-1)?.a ?? 0
  const average = series.length ? series.reduce((n, r) => n + r.a, 0) / series.length : 0
  const change = average > 0 ? ((readToday - average) / average) * 100 : 0
  const peak = series.reduce((best, r) => (r.a > best.a ? r : best), { label: '—', a: 0, b: 0 })
  const reflections = series.reduce((n, r) => n + (r.b ?? 0), 0)
  const completions = series.reduce((n, r) => n + r.a, 0)
  const onStreak = streaks
    .filter((b) => b.bucket !== 'none')
    .reduce((n, b) => n + Number(b.members), 0)

  // Most urgent first: a runway that runs out is the only item here with a
  // deadline attached, so it leads whenever it is close.
  const tasks: Array<{
    tone: 'crit' | 'warn'
    icon: IconName
    title: string
    sub: string
    href: string
    cta: string
  }> = []
  if (runway <= 7) {
    tasks.push({
      tone: runway <= 3 ? 'crit' : 'warn',
      icon: 'schedule',
      title: `${runway} ${runway === 1 ? 'day' : 'days'} of content left`,
      sub: health?.last_scheduled
        ? `Last scheduled ${formatEthiopic(health.last_scheduled, 'en')} · ${health.last_scheduled}`
        : 'Nothing is scheduled at all',
      href: '/schedule',
      cta: 'Schedule',
    })
  }
  if (health?.incomplete_days) {
    tasks.push({
      tone: 'warn',
      icon: 'library',
      title: `${health.incomplete_days} ${health.incomplete_days === 1 ? 'day is' : 'days are'} untranslated`,
      sub: 'A day with one language missing is invisible to half the ministry',
      href: '/books',
      cta: 'Library',
    })
  }
  if (health?.awaiting_review) {
    tasks.push({
      tone: 'warn',
      icon: 'clock',
      title: `${health.awaiting_review} awaiting review`,
      sub: 'Review is the step between a typo and everyone reading it',
      href: '/books',
      cta: 'Review',
    })
  }
  if (health?.unscheduled_days) {
    tasks.push({
      tone: 'warn',
      icon: 'schedule',
      title: `${health.unscheduled_days} ${health.unscheduled_days === 1 ? 'day has' : 'days have'} no date`,
      sub: 'Written and published, but nobody will ever be shown them',
      href: '/schedule',
      cta: 'Schedule',
    })
  }
  if (health?.reference_problems) {
    tasks.push({
      tone: 'crit',
      icon: 'book',
      title: `${health.reference_problems} reference ${health.reference_problems === 1 ? 'problem' : 'problems'}`,
      sub: 'Written scripture references that parsed to nothing',
      href: '/books',
      cta: 'Fix',
    })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-sub">
            Everything here is a count. Reflections are readable only by the member who
            wrote them &mdash; the database enforces that, not this page.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/analytics" className="button">
            <Icon name="analytics" size={14} /> Analytics
          </Link>
          <Link href="/books" className="button primary">
            <Icon name="plus" size={14} /> New round
          </Link>
        </div>
      </div>

      {runway <= 7 && (
        <div className={`banner${runway <= 3 ? ' crit' : ''}`} style={{ marginBottom: 14 }}>
          <span style={{ color: runway <= 3 ? 'var(--crit)' : 'var(--warn)', display: 'flex', flex: 'none' }}>
            <Icon name="alert" size={17} strokeWidth={1.7} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: runway <= 3 ? '#7c1d17' : '#5c3d00' }}>
              {runway <= 0
                ? 'Content has run out'
                : `Content runs out in ${runway} ${runway === 1 ? 'day' : 'days'}`}
            </div>
            <div style={{ fontSize: 11.5, color: runway <= 3 ? '#8f342c' : '#7a5710' }}>
              After the last scheduled day, every member opens the app to &ldquo;nothing
              scheduled&rdquo; on the same morning.
            </div>
          </div>
          <Link href="/schedule" className="button small" style={{ flex: 'none', background: '#fff' }}>
            Open schedule <Icon name="chevron" size={12} strokeWidth={1.8} />
          </Link>
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className={`card kpi${runway <= 3 ? ' alert' : runway <= 7 ? ' warn' : ''}`}>
          <div className="kpi-label">Runway</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="kpi-value">
              {runway}
              <span className="unit"> {runway === 1 ? 'day' : 'days'}</span>
            </div>
            {runway <= 7 && (
              <span className={`pill ${runway <= 3 ? 'crit' : 'in_review'}`}>
                <Icon name="alert" size={11} strokeWidth={2} /> {runway <= 3 ? 'Critical' : 'Low'}
              </span>
            )}
          </div>
          <div className="kpi-foot">
            {health?.last_scheduled
              ? `Ends ${formatEthiopic(health.last_scheduled, 'en')}`
              : 'Nothing scheduled'}
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Read today</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div className="kpi-value">{readToday}</div>
            <Sparkline values={series.map((r) => r.a)} />
          </div>
          <div className="kpi-foot">
            {series.length > 1 && (
              <span className={`delta ${change > 1 ? 'up' : change < -1 ? 'down' : 'flat'}`}>
                {change > 1 ? '▲' : change < -1 ? '▼' : '±'} {Math.abs(change).toFixed(1)}%
              </span>
            )}{' '}
            vs. 14-day average of {average.toFixed(1)}
          </div>
        </div>

        <div className="card kpi">
          <div className="kpi-label">Completion rate</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <div className="kpi-value">
              {members ? ((readToday / members) * 100).toFixed(1) : '—'}
              <span className="unit">%</span>
            </div>
            <Sparkline values={series.map((r) => (members ? (r.a / members) * 100 : 0))} />
          </div>
          <div className="kpi-foot">
            {readToday} of {members} {members === 1 ? 'member' : 'members'}
          </div>
        </div>

        <Link href="/users" className="card kpi metric">
          <div className="kpi-label">Members on a streak</div>
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div className="kpi-value">{onStreak}</div>
            <span className="metric-go">
              <Icon name="arrow" size={15} />
            </span>
          </div>
          <div className="kpi-foot">
            {members ? `${Math.round((onStreak / members) * 100)}% of ${members}` : 'No members yet'}
          </div>
        </Link>
      </div>

      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1.62fr) minmax(0, 1fr)', marginBottom: 14 }}>
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Read each day</h2>
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
              Last 14 days
            </span>
          </div>
          <div className="card-body" style={{ paddingTop: 10 }}>
            <BarsLine data={series} />
            <div
              className="row"
              style={{ gap: 20, marginTop: 8, paddingTop: 9, borderTop: '1px solid var(--line)' }}
            >
              <div>
                <div className="eyebrow">Avg / day</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {average.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="eyebrow">Peak</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {peak.a}{' '}
                  <span className="faint" style={{ fontSize: 10.5, fontWeight: 400 }}>
                    {peak.label}
                  </span>
                </div>
              </div>
              <div>
                <div className="eyebrow">Reflection rate</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                  {completions ? ((reflections / completions) * 100).toFixed(1) : '0.0'}%
                </div>
              </div>
              <Link href="/analytics" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
                Open analytics →
              </Link>
            </div>
          </div>
        </section>

        {/* Sized to its contents rather than stretched to match the chart beside it:
            on a good week this list is one row, and a card padded out with white
            space reads as something failing to load. */}
        <section className="card" style={{ display: 'flex', flexDirection: 'column', alignSelf: 'start' }}>
          <div className="card-head">
            <h2 className="card-title">Needs you</h2>
            {tasks.length > 0 && <span className="pill crit">{tasks.length}</span>}
            <span className="card-note" style={{ marginLeft: 'auto' }}>
              Most urgent first
            </span>
          </div>
          <div style={{ flex: 1 }}>
            {tasks.map((task) => (
              <Link
                key={task.title}
                href={task.href}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '9px 14px',
                  borderBottom: '1px solid var(--line)',
                  color: 'inherit',
                }}
              >
                <span style={{ color: `var(--${task.tone})`, display: 'flex', marginTop: 1, flex: 'none' }}>
                  <Icon name={task.icon} size={15} strokeWidth={1.6} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                    {task.title}
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11.5,
                      color: 'var(--ink-3)',
                      marginTop: 1,
                    }}
                  >
                    {task.sub}
                  </span>
                </span>
                <span className="button small" style={{ flex: 'none', marginTop: 1 }}>
                  {task.cta}
                </span>
              </Link>
            ))}
          </div>
          <div className="card-foot" style={{ color: 'var(--good)' }}>
            <Icon name="check" size={13} strokeWidth={2} />
            {tasks.length === 0
              ? 'Nothing incomplete, unreviewed or undated.'
              : 'Everything else is published and dated.'}
          </div>
        </section>
      </div>

      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1.62fr) minmax(0, 1fr)', marginBottom: 14 }}>
        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Drop-off within each book</h2>
            <span className="card-note">readers per day, published days only</span>
            <Link href="/analytics" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
              All books →
            </Link>
          </div>
          <div className="card-body">
            <DropOffPanels rows={dropoff} members={members} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h2 className="card-title">Streak distribution</h2>
            <Link href="/users" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
              Members →
            </Link>
          </div>
          <div className="card-body">
            <StreakChart buckets={streaks} />
            <p className="faint" style={{ fontSize: 11, margin: '9px 0 0' }}>
              Buckets, not people. {onStreak} of {members} have a streak running today.
            </p>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">Recent changes</h2>
          <span className="card-note">from the revision log</span>
        </div>
        {revisions.length === 0 ? (
          <div className="card-body">
            <p className="muted" style={{ margin: 0 }}>
              Nothing has been changed yet.
            </p>
          </div>
        ) : (
          <table>
            <tbody>
              {revisions.map((row) => (
                <tr key={row.id}>
                  <td style={{ width: '1%', paddingRight: 0 }}>
                    <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
                      {(names.get(row.author_id ?? '') ?? '?')
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase() ?? '')
                        .join('')}
                    </span>
                  </td>
                  <td>
                    <span className="t-strong">{names.get(row.author_id ?? '') ?? 'Someone'}</span>{' '}
                    <span className="muted">{STATUS_VERB[row.status] ?? 'changed'}</span>{' '}
                    <span className="t-strong">
                      {entities.get(row.entity_id) ?? `a ${row.entity_type}`}
                    </span>
                  </td>
                  <td className="r mono faint" style={{ fontSize: 11.5, width: '1%', whiteSpace: 'nowrap' }}>
                    {new Date(row.created_at).toLocaleString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

const BUCKET_ORDER = ['none', '1-3', '4-7', '8-14', '15-30', '30+']
const BUCKET_LABEL: Record<string, string> = {
  none: 'None',
  '1-3': '1–3 days',
  '4-7': '4–7 days',
  '8-14': '8–14 days',
  '15-30': '15–30 days',
  '30+': '30+ days',
}

function StreakChart({ buckets }: { buckets: Bucket[] }) {
  const byBucket = new Map(buckets.map((b) => [b.bucket, Number(b.members)]))
  const total = buckets.reduce((n, b) => n + Number(b.members), 0)

  if (total === 0) return <p className="muted">No members yet.</p>

  return (
    <HBars
      width={336}
      labelWidth={62}
      valueWidth={62}
      rows={BUCKET_ORDER.map((bucket) => {
        const value = byBucket.get(bucket) ?? 0
        return {
          label: BUCKET_LABEL[bucket] ?? bucket,
          value,
          display: `${value} · ${Math.round((value / total) * 100)}%`,
          // "None" is a real answer, not a small one — but it is not an
          // achievement either, so it stays neutral rather than taking the accent.
          ...(bucket === 'none' ? { color: '#ccd4dd' } : {}),
        }
      })}
    />
  )
}

function DropOffPanels({ rows, members }: { rows: DropOff[]; members: number }) {
  if (rows.length === 0) return <p className="muted">No published days yet.</p>

  const books = [...new Set(rows.map((r) => r.book_id))].slice(0, 2)
  const peak = Math.max(members, ...rows.map((r) => Number(r.readers)), 1)

  return (
    <>
      <div className="cols" style={{ gridTemplateColumns: `repeat(${books.length}, minmax(0, 1fr))`, gap: 20 }}>
        {books.map((bookId) => {
          const days = rows.filter((r) => r.book_id === bookId)
          const first = Number(days[0]?.readers ?? 0)
          const last = Number(days.at(-1)?.readers ?? 0)
          const fell = first > 0 ? Math.round(((first - last) / first) * 100) : 0

          return (
            <div key={bookId}>
              <div className="spread" style={{ marginBottom: 7, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                  {days[0]?.book_title_en}
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-2)' }}>
                    {first} → {last}
                  </div>
                  {fell > 0 && (
                    <div className="mono" style={{ fontSize: 10.5, color: 'var(--crit)' }}>
                      −{fell}% readers
                    </div>
                  )}
                </div>
              </div>
              <Columns
                values={days.map((d) => Number(d.readers))}
                summaryAt={days.map((d, i) => (d.kind === 'summary' ? i : -1)).filter((i) => i >= 0)}
                titles={days.map((d) => `Day ${d.day_number}: ${d.topic_en} — ${d.readers} reader(s)`)}
                max={peak}
                height={62}
              />
              <div className="spread" style={{ marginTop: 3 }}>
                <span className="mono faint" style={{ fontSize: 10 }}>
                  Day {days[0]?.day_number ?? 1}
                </span>
                <span className="mono faint" style={{ fontSize: 10 }}>
                  Day {days.at(-1)?.day_number ?? days.length}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="faint" style={{ fontSize: 11, margin: '11px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M5 1l4 7H1z" fill="var(--warn)" />
        </svg>
        marks a summary day · an empty column means nobody read it
      </p>
    </>
  )
}
