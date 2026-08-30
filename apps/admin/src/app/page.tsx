'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db } from '../lib/db'
import { RequireAdmin } from '../components/RequireAdmin'

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

interface Membership {
  joined_on: string
  joined: number
  amharic: number
  english: number
}

async function fetchOverview() {
  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10)

  // All of these are counts-only functions. The dashboard has no way to read a
  // reflection, and these deliberately do not give it one.
  const [health, engagement, dropoff, streaks, membership] = await Promise.all([
    db.rpc('content_health'),
    db.rpc('ministry_engagement', { p_from: from, p_to: to }),
    db.rpc('ministry_dropoff'),
    db.rpc('ministry_streaks'),
    db.rpc('ministry_membership'),
  ])

  return {
    health: (health.data as Health[] | null)?.[0] ?? null,
    engagement: (engagement.data as Engagement[] | null) ?? [],
    dropoff: (dropoff.data as DropOff[] | null) ?? [],
    streaks: (streaks.data as Bucket[] | null) ?? [],
    membership: (membership.data as Membership[] | null) ?? [],
  }
}

export default function Overview() {
  return (
    <RequireAdmin>
      <OverviewInner />
    </RequireAdmin>
  )
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
  const { health, engagement, dropoff, streaks, membership } = data

  const runway = health?.runway_days ?? 0
  const needsAttention =
    (health?.incomplete_days ?? 0) + (health?.awaiting_review ?? 0) + (health?.unscheduled_days ?? 0)
  const readToday = engagement.at(-1)?.completions ?? 0
  const activeStreaks = streaks
    .filter((b) => b.bucket !== 'none')
    .reduce((n, b) => n + Number(b.members), 0)

  return (
    <>
      <div className="page-head">
        <h2>Overview</h2>
        <p className="sub">
          Everything below is a count. Reflections are readable only by their author,
          enforced by the database rather than by this page.
        </p>
      </div>

      {/* Every number is a door to the page that explains it. */}
      <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
        <Metric
          href="/schedule"
          value={runway}
          label={runway === 1 ? 'day of content left' : 'days of content left'}
          tone={runway <= 3 ? 'alert' : runway <= 7 ? 'warn' : undefined}
          note={
            health?.last_scheduled
              ? `Last scheduled ${formatEthiopic(health.last_scheduled, 'en')}`
              : 'Nothing scheduled'
          }
        />
        <Metric
          href="/books"
          value={needsAttention}
          label={needsAttention === 1 ? 'thing needs attention' : 'things need attention'}
          tone={needsAttention > 0 ? 'warn' : undefined}
          note={
            needsAttention === 0
              ? 'Nothing incomplete or awaiting review'
              : [
                  health?.incomplete_days ? `${health.incomplete_days} untranslated` : null,
                  health?.awaiting_review ? `${health.awaiting_review} in review` : null,
                  health?.unscheduled_days ? `${health.unscheduled_days} unscheduled` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
          }
        />
        <Metric
          href="/users"
          value={health?.members ?? 0}
          label={health?.members === 1 ? 'member' : 'members'}
          note={`${activeStreaks} on a streak`}
        />
        <Metric
          href="/books"
          value={readToday}
          label="read today"
          note={`of ${health?.members ?? 0} members`}
        />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="spread" style={{ marginBottom: '.5rem' }}>
            <h3 style={{ margin: 0 }}>Read each day</h3>
            <span className="eyebrow">last 14 days</span>
          </div>
          <DailyChart rows={engagement} />
        </section>

        <section className="card">
          <div className="spread" style={{ marginBottom: '.5rem' }}>
            <h3 style={{ margin: 0 }}>Current streaks</h3>
            <Link href="/users" className="eyebrow">
              members →
            </Link>
          </div>
          <StreakChart buckets={streaks} />
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="spread" style={{ marginBottom: '.15rem' }}>
          <h3 style={{ margin: 0 }}>Drop-off within each book</h3>
          <span className="eyebrow">readers per day</span>
        </div>
        <p className="sub" style={{ marginBottom: '.8rem' }}>
          Where people stop. This is the number most likely to change what the ministry
          writes next.
        </p>
        <DropOffChart rows={dropoff} />
      </section>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="spread" style={{ marginBottom: '.6rem' }}>
          <h3 style={{ margin: 0 }}>Members</h3>
          <Link href="/users" className="eyebrow">
            manage →
          </Link>
        </div>
        <MembershipSummary rows={membership} />
      </section>
    </>
  )
}

function Metric({
  href, value, label, note, tone,
}: {
  href: string
  value: number
  label: string
  note?: string | undefined
  tone?: 'alert' | 'warn' | undefined
}) {
  return (
    <Link href={href} className={`metric${tone ? ` ${tone}` : ''}`}>
      <div className="spread">
        <span className="metric-value">{value}</span>
        <span className="metric-go">→</span>
      </div>
      <div className="metric-label">{label}</div>
      {note && <div className="metric-note muted">{note}</div>}
    </Link>
  )
}

function DailyChart({ rows }: { rows: Engagement[] }) {
  if (rows.length === 0) return <p className="muted">Nothing read yet.</p>
  const peak = Math.max(1, ...rows.map((r) => Number(r.completions)))

  return (
    <div style={{ display: 'grid', gap: '.25rem' }}>
      {rows.map((row) => (
        <div key={row.scheduled_date} className="row" style={{ gap: '.6rem' }}>
          <span className="mono" style={{ width: '3.4rem' }}>
            {row.scheduled_date.slice(5)}
          </span>
          <div className="bar-track" style={{ flex: 1 }}>
            <div
              className="bar-fill"
              style={{ width: `${(Number(row.completions) / peak) * 100}%` }}
            />
          </div>
          <span className="mono" style={{ width: '1.6rem', textAlign: 'right' }}>
            {row.completions}
          </span>
        </div>
      ))}
    </div>
  )
}

const BUCKET_ORDER = ['none', '1-3', '4-7', '8-14', '15-30', '30+']

function StreakChart({ buckets }: { buckets: Bucket[] }) {
  const byBucket = new Map(buckets.map((b) => [b.bucket, Number(b.members)]))
  const peak = Math.max(1, ...buckets.map((b) => Number(b.members)))

  return (
    <div style={{ display: 'grid', gap: '.3rem' }}>
      {BUCKET_ORDER.map((bucket) => {
        const members = byBucket.get(bucket) ?? 0
        return (
          <div key={bucket} className="row" style={{ gap: '.6rem' }}>
            <span className="mono" style={{ width: '3.4rem' }}>
              {bucket === 'none' ? '0' : bucket}
            </span>
            <div className="bar-track" style={{ flex: 1 }}>
              <div
                className={`bar-fill${bucket === 'none' ? '' : ' ok'}`}
                style={{ width: `${(members / peak) * 100}%` }}
              />
            </div>
            <span className="mono" style={{ width: '1.6rem', textAlign: 'right' }}>
              {members}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function DropOffChart({ rows }: { rows: DropOff[] }) {
  if (rows.length === 0) return <p className="muted">No published days yet.</p>

  const books = [...new Set(rows.map((r) => r.book_id))]
  const peak = Math.max(1, ...rows.map((r) => Number(r.readers)))

  return (
    <div className="stack">
      {books.map((bookId) => {
        const days = rows.filter((r) => r.book_id === bookId)
        const first = Number(days[0]?.readers ?? 0)
        const last = Number(days.at(-1)?.readers ?? 0)
        const fell = first > 0 ? Math.round(((first - last) / first) * 100) : 0

        return (
          <div key={bookId}>
            <div className="spread" style={{ marginBottom: '.3rem' }}>
              <strong style={{ fontSize: '.85rem' }}>{days[0]?.book_title_en}</strong>
              <span className="muted" style={{ fontSize: '.78rem' }}>
                {first} → {last} readers
                {fell > 0 && <span className="problem"> · {fell}% fewer</span>}
              </span>
            </div>
            {/* One column per day, in order. A staircase down is the story. */}
            <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 54 }}>
              {days.map((day) => (
                // A zero-reader day is drawn as a visible empty column rather
                // than a sliver, so "nobody read it" cannot be mistaken for
                // "no data here".
                <div
                  key={day.day_number}
                  title={`Day ${day.day_number}: ${day.topic_en} — ${day.readers} reader(s)`}
                  style={{
                    flex: 1,
                    minWidth: 3,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                    background: 'var(--surface-sunk)',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: `${(Number(day.readers) / peak) * 100}%`,
                      background: day.kind === 'summary' ? 'var(--warn)' : 'var(--accent)',
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <p className="faint" style={{ fontSize: '.72rem', margin: 0 }}>
        Hover a column for the day. Amber marks a summary day; an empty column means
        nobody read it.
      </p>
    </div>
  )
}

function MembershipSummary({ rows }: { rows: Membership[] }) {
  if (rows.length === 0) return <p className="muted">No members yet.</p>

  const total = rows.reduce((n, r) => n + Number(r.joined), 0)
  const amharic = rows.reduce((n, r) => n + Number(r.amharic), 0)
  const english = rows.reduce((n, r) => n + Number(r.english), 0)

  return (
    <div className="grid-2">
      <div>
        <div className="eyebrow" style={{ marginBottom: '.4rem' }}>
          Reading language
        </div>
        <div className="row" style={{ gap: '.5rem', marginBottom: '.3rem' }}>
          <span style={{ width: '4.5rem', fontSize: '.82rem' }} lang="am">
            አማርኛ
          </span>
          <div className="bar-track" style={{ flex: 1 }}>
            <div className="bar-fill" style={{ width: `${(amharic / total) * 100}%` }} />
          </div>
          <span className="mono">{amharic}</span>
        </div>
        <div className="row" style={{ gap: '.5rem' }}>
          <span style={{ width: '4.5rem', fontSize: '.82rem' }}>English</span>
          <div className="bar-track" style={{ flex: 1 }}>
            <div className="bar-fill" style={{ width: `${(english / total) * 100}%` }} />
          </div>
          <span className="mono">{english}</span>
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: '.4rem' }}>
          Joined
        </div>
        <table>
          <tbody>
            {rows.slice(-5).reverse().map((row) => (
              <tr key={row.joined_on}>
                <td>{formatEthiopic(row.joined_on, 'en')}</td>
                <td className="mono">{row.joined_on}</td>
                <td className="num">{row.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
