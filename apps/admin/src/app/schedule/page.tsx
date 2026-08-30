'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ethiopicMonthDays, monthName, PAGUME, toEthiopic, formatEthiopic,
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

/**
 * The round's calendar, in the Ethiopian calendar with Gregorian beneath.
 *
 * Days run every calendar day including Sundays. Gaps between books are simply
 * dates with nothing scheduled, and they are shown as gaps rather than hidden —
 * an admin needs to see that the next book has not been scheduled yet, because
 * that is precisely when every user hits "coming soon" at once.
 */
export default function Schedule() {
  return (
    <RequireAdmin>
      <ScheduleInner />
    </RequireAdmin>
  )
}

function ScheduleInner() {
  const [days, setDays] = useState<ScheduledDay[]>([])
  const [books, setBooks] = useState<Record<string, string>>({})
  const [month, setMonth] = useState(() => {
    const ec = toEthiopic(new Date().toISOString().slice(0, 10))
    return { year: ec.year, month: ec.month }
  })

  const load = useCallback(async () => {
    const [{ data: rows }, { data: bookRows }] = await Promise.all([
      db
        .from('devotion_days')
        .select('id, book_id, day_number, kind, topic_en, scheduled_date, status')
        .order('scheduled_date'),
      db.from('books').select('id, title_en'),
    ])
    return {
      days: (rows as ScheduledDay[] | null) ?? [],
      books: Object.fromEntries(
        ((bookRows as Array<{ id: string; title_en: string }> | null) ?? []).map((b) => [
          b.id, b.title_en,
        ]),
      ),
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await load()
      if (!cancelled) {
        setDays(data.days)
        setBooks(data.books)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const byDate = useMemo(() => {
    const map = new Map<string, ScheduledDay>()
    for (const day of days) if (day.scheduled_date) map.set(day.scheduled_date, day)
    return map
  }, [days])

  const cells = ethiopicMonthDays(month.year, month.month)

  const step = (delta: number) =>
    setMonth((m) => {
      const next = m.month + delta
      if (next < 1) return { year: m.year - 1, month: PAGUME }
      if (next > PAGUME) return { year: m.year + 1, month: 1 }
      return { ...m, month: next }
    })

  const unscheduled = days.filter((d) => !d.scheduled_date)
  const last = days.filter((d) => d.scheduled_date).at(-1)

  return (
    <>
      <h2>Schedule</h2>
      <p className="sub">
        Ethiopian calendar, Gregorian beneath. Days run every day including Sundays.
      </p>

      {/*
        The single point of failure the spec warns about: if nobody schedules the
        next book, every user hits "coming soon" on the same morning.
      */}
      {last?.scheduled_date && (
        <ScheduleWarning lastDate={last.scheduled_date} />
      )}

      {unscheduled.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: '1rem' }}>
          <strong>{unscheduled.length} day(s) have no date yet</strong>
          <p className="muted" style={{ margin: '.35rem 0 0' }}>
            They are invisible to readers until they are scheduled.
          </p>
        </div>
      )}

      <div className="spread" style={{ marginBottom: '.75rem' }}>
        <button onClick={() => step(-1)}>‹</button>
        <strong>
          {monthName(month.month, 'en')} {month.year}
          <span className="muted" style={{ fontWeight: 400 }}>
            {' '}· {monthName(month.month, 'am')}
          </span>
        </strong>
        <button onClick={() => step(1)}>›</button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '.5rem',
        }}
      >
        {cells.map((cell) => {
          const day = byDate.get(cell.iso)
          return (
            <div
              key={cell.iso}
              className="card"
              style={{
                padding: '.5rem .6rem',
                minHeight: 84,
                // A gap is shown as a gap: visibly empty, not skipped.
                background: day ? 'var(--surface)' : 'transparent',
                borderStyle: day ? 'solid' : 'dashed',
              }}
            >
              <div className="spread">
                <strong style={{ fontSize: '.9rem' }}>{cell.ethiopicDay}</strong>
                {day && <span className={`pill ${day.status}`} style={{ fontSize: '.62rem' }}>
                  {day.status === 'published' ? '●' : day.status === 'in_review' ? '◐' : '○'}
                </span>}
              </div>
              <div className="muted mono" style={{ fontSize: '.65rem' }}>
                {cell.iso.slice(5)}
              </div>
              {day ? (
                <Link href={`/days/${day.id}`} style={{ fontSize: '.75rem', display: 'block' }}>
                  {day.kind === 'summary' ? '★ ' : ''}
                  {day.topic_en || `Day ${day.day_number}`}
                </Link>
              ) : (
                <span className="muted" style={{ fontSize: '.7rem' }}>—</span>
              )}
              {day && (
                <div className="muted" style={{ fontSize: '.65rem' }}>
                  {books[day.book_id]}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}

function ScheduleWarning({ lastDate }: { lastDate: string }) {
  const daysLeft = Math.round(
    (Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
      86_400_000,
  )

  if (daysLeft > 3) return null

  return (
    <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
      <strong className="problem">
        {daysLeft < 0
          ? 'The round has already run out.'
          : `The round runs out in ${daysLeft} day(s).`}
      </strong>
      <p className="muted" style={{ margin: '.35rem 0 0' }}>
        The last scheduled day is {formatEthiopic(lastDate, 'en')} ({lastDate}). When it
        passes, every reader sees &ldquo;coming soon&rdquo; on the same morning — schedule
        the next book before then.
      </p>
    </div>
  )
}
