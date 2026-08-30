'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ethiopicMonthDays, formatEthiopic, monthName, PAGUME, toEthiopic,
} from '@abide/domain'
import { db } from '../../lib/db'
import { RequireAdmin } from '../../components/RequireAdmin'

interface ScheduledDay {
  id: string
  book_id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  scheduled_date: string | null
  status: string
}

interface BookMeta {
  id: string
  title_en: string
  status: string
  sequence: number
}

async function fetchSchedule() {
  const [{ data: rows }, { data: bookRows }, { data: today }] = await Promise.all([
    db
      .from('devotion_days')
      .select('id, book_id, day_number, kind, topic_en, scheduled_date, status')
      .order('scheduled_date'),
    db.from('books').select('id, title_en, status, sequence').order('sequence'),
    db.rpc('ministry_today'),
  ])

  return {
    days: (rows as ScheduledDay[] | null) ?? [],
    books: (bookRows as BookMeta[] | null) ?? [],
    today: (today as string | null) ?? new Date().toISOString().slice(0, 10),
  }
}

/**
 * Two questions, one screen.
 *
 * "Are we covered?" is answered by the runway strip: every scheduled day of the
 * round as one cell, read left to right, so an approaching end or an unpublished
 * stretch is visible without counting anything.
 *
 * "What about this particular day?" is answered by the month grid beneath, in the
 * Ethiopian calendar with the Gregorian date on every cell.
 */
export default function Schedule() {
  return (
    <RequireAdmin>
      <ScheduleInner />
    </RequireAdmin>
  )
}

function ScheduleInner() {
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSchedule>> | null>(null)
  const [month, setMonth] = useState<{ year: number; month: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await fetchSchedule()
      if (cancelled) return
      setData(next)
      const ec = toEthiopic(next.today)
      setMonth({ year: ec.year, month: ec.month })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduledDay>()
    for (const day of data?.days ?? []) if (day.scheduled_date) map.set(day.scheduled_date, day)
    return map
  }, [data])

  if (!data || !month) return <p className="muted">Loading…</p>

  const { days, books, today } = data
  const bookById = new Map(books.map((b) => [b.id, b]))
  const scheduled = days
    .filter((d) => d.scheduled_date)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!))
  const unscheduled = days.filter((d) => !d.scheduled_date)

  const first = scheduled[0]?.scheduled_date
  const last = scheduled.at(-1)?.scheduled_date
  const runwayDays = last
    ? Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : 0
  const past = scheduled.filter((d) => d.scheduled_date! < today).length
  const remaining = scheduled.length - past

  return (
    <>
      <div className="page-head">
        <h2>Schedule</h2>
        <p className="sub">
          Ethiopian calendar with the Gregorian date beneath. Days run every day
          including Sundays; a gap between books is simply a date with nothing on it.
        </p>
      </div>

      <div className="grid-4" style={{ marginBottom: '1.25rem' }}>
        <Stat
          value={runwayDays}
          label={runwayDays === 1 ? 'day of runway' : 'days of runway'}
          tone={runwayDays <= 3 ? 'alert' : runwayDays <= 7 ? 'warn' : undefined}
          note={last ? `Ends ${formatEthiopic(last, 'en')}` : 'Nothing scheduled'}
        />
        <Stat value={past} label="days delivered" note={first ? `Since ${first}` : ''} />
        <Stat value={remaining} label="days still to come" />
        <Stat
          value={unscheduled.length}
          label="days with no date"
          tone={unscheduled.length > 0 ? 'warn' : undefined}
          note={unscheduled.length > 0 ? 'Invisible to readers until scheduled' : 'All scheduled'}
        />
      </div>

      {runwayDays <= 3 && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1.25rem' }}>
          <strong className="problem">
            {runwayDays < 0
              ? 'The round has already run out.'
              : `The round runs out in ${runwayDays} day(s).`}
          </strong>
          <p className="muted" style={{ margin: '.3rem 0 0', fontSize: '.85rem' }}>
            When the last scheduled day passes, every reader sees &ldquo;coming
            soon&rdquo; on the same morning. Schedule the next book before then.
          </p>
        </div>
      )}

      {/* The whole round in one strip: one cell per scheduled day, in order. */}
      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="spread">
          <h3 style={{ margin: 0 }}>The round, end to end</h3>
          <span className="eyebrow">
            {first} → {last}
          </span>
        </div>
        <div className="runway">
          {scheduled.map((day) => {
            const book = bookById.get(day.book_id)
            const state =
              day.scheduled_date === today
                ? 'today'
                : book?.status !== 'published'
                  ? 'unpublished'
                  : day.scheduled_date! < today
                    ? 'past'
                    : 'future'
            return (
              <span
                key={day.id}
                className={state}
                title={`${day.scheduled_date} · ${day.topic_en} · ${book?.title_en ?? ''}`}
              />
            )
          })}
        </div>
        <div className="legend">
          <span>
            <i style={{ background: 'var(--accent)', opacity: 0.35 }} />
            delivered
          </span>
          <span>
            <i style={{ background: 'var(--fg)' }} />
            today
          </span>
          <span>
            <i style={{ background: 'var(--line-strong)' }} />
            still to come
          </span>
          <span>
            <i style={{ background: 'var(--warn)', opacity: 0.6 }} />
            book not published
          </span>
        </div>
      </section>

      <section className="card">
        <div className="spread" style={{ marginBottom: '.7rem' }}>
          <button
            className="small"
            onClick={() =>
              setMonth((m) =>
                m
                  ? m.month === 1
                    ? { year: m.year - 1, month: PAGUME }
                    : { ...m, month: m.month - 1 }
                  : m,
              )
            }
          >
            ‹ earlier
          </button>
          <strong>
            {monthName(month.month, 'en')} {month.year}
            <span className="muted" style={{ fontWeight: 400 }} lang="am">
              {' · '}
              {monthName(month.month, 'am')}
            </span>
          </strong>
          <button
            className="small"
            onClick={() =>
              setMonth((m) =>
                m
                  ? m.month === PAGUME
                    ? { year: m.year + 1, month: 1 }
                    : { ...m, month: m.month + 1 }
                  : m,
              )
            }
          >
            later ›
          </button>
        </div>

        <div className="cal">
          {ethiopicMonthDays(month.year, month.month).map((cell) => {
            const day = byDate.get(cell.iso)
            const book = day ? bookById.get(day.book_id) : undefined
            const classes = [
              'cal-cell',
              !day ? 'is-empty' : '',
              cell.iso === today ? 'is-today' : '',
              day && cell.iso < today ? 'is-past' : '',
              day && book?.status !== 'published' ? 'is-unpublished' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <div key={cell.iso} className={classes}>
                <div className="cal-day">
                  <span className="cal-num">{cell.ethiopicDay}</span>
                  <span className="mono">{cell.iso.slice(5)}</span>
                </div>

                {cell.iso === today && <span className="eyebrow">today</span>}

                {day ? (
                  <>
                    <Link href={`/days/${day.id}`} className="cal-title">
                      {day.kind === 'summary' ? '★ ' : ''}
                      {day.topic_en || `Day ${day.day_number}`}
                    </Link>
                    <span className="cal-book">{book?.title_en}</span>
                    {book?.status !== 'published' && (
                      <span className={`pill ${book?.status}`}>{book?.status}</span>
                    )}
                  </>
                ) : (
                  <span className="faint">no devotion</span>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

function Stat({
  value, label, note, tone,
}: {
  value: number
  label: string
  note?: string | undefined
  tone?: 'alert' | 'warn' | undefined
}) {
  return (
    <div className={`card${tone ? ` metric ${tone}` : ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {note && <div className="metric-note muted">{note}</div>}
    </div>
  )
}
