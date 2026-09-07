'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ethiopicMonthDays, formatEthiopic, monthName, PAGUME, toEthiopic } from '@abide/domain'
import { db } from '../../lib/db'
import { RequireAdmin } from '../../components/RequireAdmin'
import { Icon } from '../../components/Icon'
import { DayDrawer, type DrawerTarget } from '../../components/DayDrawer'
import { roundHex } from '../../lib/round-colours'

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
  round_id: string
}

interface RoundMeta {
  id: string
  phase_code: string
  round_code: string
  colour: string
  status: string
}

async function fetchSchedule() {
  const [{ data: rows }, { data: bookRows }, { data: today }, { data: roundRows }] = await Promise.all([
    db
      .from('devotion_days')
      .select('id, book_id, day_number, kind, topic_en, scheduled_date, status')
      .order('scheduled_date'),
    db.from('books').select('id, title_en, status, sequence, round_id').order('sequence'),
    db.rpc('ministry_today'),
    db.from('rounds').select('id, phase_code, round_code, colour, status').order('round_code'),
  ])

  return {
    days: (rows as ScheduledDay[] | null) ?? [],
    books: (bookRows as BookMeta[] | null) ?? [],
    today: (today as string | null) ?? new Date().toISOString().slice(0, 10),
    rounds: (roundRows as RoundMeta[] | null) ?? [],
  }
}

const WEEKDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const weekdayOf = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? ''

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
  const [preview, setPreview] = useState<DrawerTarget | null>(null)

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

  const { days, books, today, rounds } = data
  const bookById = new Map(books.map((b) => [b.id, b]))
  const roundById = new Map(rounds.map((r) => [r.id, r]))
  const roundOfBook = (bookId: string) => {
    const book = bookById.get(bookId)
    return book ? roundById.get(book.round_id) : undefined
  }
  const roundName = (r: RoundMeta | undefined) =>
    r ? `Phase ${r.phase_code} · Round ${r.round_code}` : undefined
  const scheduled = days
    .filter((d) => d.scheduled_date)
    .sort((a, b) => a.scheduled_date!.localeCompare(b.scheduled_date!))
  const unscheduled = days.filter((d) => !d.scheduled_date)

  const first = scheduled[0]?.scheduled_date ?? null
  const last = scheduled.at(-1)?.scheduled_date ?? null
  const runwayDays = last
    ? Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : 0
  const past = scheduled.filter((d) => d.scheduled_date! < today).length

  const monthCells = ethiopicMonthDays(month.year, month.month)
  const goMonth = (delta: -1 | 1) =>
    setMonth((m) => {
      if (!m) return m
      if (delta === -1) {
        return m.month === 1 ? { year: m.year - 1, month: PAGUME } : { ...m, month: m.month - 1 }
      }
      return m.month === PAGUME ? { year: m.year + 1, month: 1 } : { ...m, month: m.month + 1 }
    })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Schedule</h1>
          <p className="page-sub">
            The Ethiopian calendar with the Gregorian date on every cell. Days run every
            day including Sundays; a gap between books is simply a date with nothing on it.
          </p>
        </div>
        <div className="head-actions">
          <Link href="/books" className="button">
            <Icon name="library" size={14} /> Library
          </Link>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2 className="card-title">Runway</h2>
          <span className="card-note">every dated day, left to right</span>
          {runwayDays <= 7 && (
            <span className={`pill ${runwayDays <= 3 ? 'crit' : 'in_review'}`} style={{ marginLeft: 'auto' }}>
              <Icon name="alert" size={11} strokeWidth={2} /> {runwayDays}{' '}
              {runwayDays === 1 ? 'day' : 'days'} left
            </span>
          )}
        </div>
        <div className="card-body">
          <div className="grid-4" style={{ marginBottom: 14 }}>
            <Stat
              label="Days left"
              value={runwayDays}
              foot={last ? `Ends ${formatEthiopic(last, 'en')}` : 'Nothing scheduled'}
              tone={runwayDays <= 3 ? 'crit' : runwayDays <= 7 ? 'warn' : undefined}
            />
            <Stat
              label="Days behind"
              value={past}
              foot={first ? `From ${formatEthiopic(first, 'en')}` : '—'}
            />
            <Stat label="Dated" value={scheduled.length} foot={`of ${days.length} days written`} />
            <Stat
              label="Undated"
              value={unscheduled.length}
              foot={unscheduled.length ? 'Written, but invisible to members' : 'Everything has a date'}
              tone={unscheduled.length > 0 ? 'warn' : undefined}
            />
          </div>

          {scheduled.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing is scheduled yet.
            </p>
          ) : (
            <>
              <div className="runway">
                {scheduled.map((day) => {
                  const book = bookById.get(day.book_id)
                  const state =
                    book?.status !== 'published'
                      ? 'unpublished'
                      : day.scheduled_date === today
                        ? 'today'
                        : day.scheduled_date! < today
                          ? 'past'
                          : 'future'
                  return (
                    <span
                      key={day.id}
                      className={state}
                      title={`${formatEthiopic(day.scheduled_date!, 'en')} · ${day.scheduled_date} — ${day.topic_en || `Day ${day.day_number}`}`}
                    />
                  )
                })}
              </div>
              <div className="spread" style={{ marginTop: 6 }}>
                <span className="mono faint" style={{ fontSize: 10.5 }}>
                  {first && `${formatEthiopic(first, 'en')} · ${first}`}
                </span>
                <span className="mono faint" style={{ fontSize: 10.5 }}>
                  {last && `${formatEthiopic(last, 'en')} · ${last}`}
                </span>
              </div>
              <div className="legend" style={{ marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
                <span>
                  <i style={{ background: '#d9a086' }} />
                  Read and gone
                </span>
                <span>
                  <i style={{ background: 'var(--ink)' }} />
                  Today
                </span>
                <span>
                  <i style={{ background: 'transparent', border: '1.5px solid var(--accent)' }} />
                  Still to come
                </span>
                <span>
                  <i style={{ background: 'var(--warn)', opacity: 0.55 }} />
                  Book not published
                </span>
                {last && runwayDays <= 7 && (
                  <span style={{ marginLeft: 'auto', color: 'var(--crit)' }}>
                    After {formatEthiopic(last, 'en')} the app shows &ldquo;nothing scheduled&rdquo;.
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <div className="cols" style={{ gridTemplateColumns: 'minmax(0, 1fr) 264px' }}>
        <section className="card">
          <div className="card-head">
            <button className="small" onClick={() => goMonth(-1)} aria-label="Earlier month">
              <span style={{ transform: 'scaleX(-1)', display: 'flex' }}>
                <Icon name="chevron" size={12} strokeWidth={2} />
              </span>
            </button>
            <h2 className="card-title" style={{ margin: '0 2px' }}>
              {monthName(month.month, 'en')} {month.year}{' '}
              <span lang="am" className="faint" style={{ fontWeight: 400 }}>
                {monthName(month.month, 'am')}
              </span>
            </h2>
            <button className="small" onClick={() => goMonth(1)} aria-label="Later month">
              <Icon name="chevron" size={12} strokeWidth={2} />
            </button>
            <span className="card-note" style={{ marginLeft: 6 }}>
              {monthCells.length} days
            </span>
            <button
              className="small"
              style={{ marginLeft: 'auto' }}
              onClick={() => {
                const ec = toEthiopic(today)
                setMonth({ year: ec.year, month: ec.month })
              }}
            >
              Jump to today
            </button>
          </div>
          <div className="card-body">
            <div className="cal-grid">
              {monthCells.map((cell) => {
                const day = byDate.get(cell.iso)
                const book = day ? bookById.get(day.book_id) : undefined
                const round = day ? roundOfBook(day.book_id) : undefined
                const classes = [
                  'cal-cell',
                  round ? 'has-stripe' : '',
                  !day ? 'is-empty' : '',
                  cell.iso === today ? 'is-today' : '',
                  day && cell.iso < today ? 'is-past' : '',
                  day && book?.status !== 'published' ? 'is-unpublished' : '',
                  preview?.iso === cell.iso ? 'is-selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')

                // The whole cell opens the preview — including empty dates, where
                // "nothing is scheduled here" is itself the answer an admin wants.
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    className={classes}
                    onClick={() =>
                      setPreview({
                        iso: cell.iso,
                        dayId: day?.id ?? null,
                        bookTitle: book?.title_en,
                        roundLabel: roundName(round),
                        roundColour: round?.colour,
                      })
                    }
                  >
                    {round && (
                      <span className="cal-stripe" style={{ background: roundHex(round.colour) }} />
                    )}
                    <div className="cal-top">
                      <span className="cal-num">{cell.ethiopicDay}</span>
                      <span className="cal-greg">
                        {weekdayOf(cell.iso)} {cell.iso.slice(5)}
                      </span>
                    </div>

                    {cell.iso === today && (
                      <span className="eyebrow" style={{ color: 'var(--accent)' }}>
                        Today
                      </span>
                    )}

                    {day ? (
                      <>
                        <span className="cal-title">
                          {day.kind === 'summary' ? '★ ' : ''}
                          {day.topic_en || `Day ${day.day_number}`}
                        </span>
                        <span className="cal-book">{book?.title_en}</span>
                        {book?.status !== 'published' && (
                          <span className={`pill ${book?.status}`}>{book?.status}</span>
                        )}
                      </>
                    ) : (
                      <span className="faint" style={{ fontSize: 11, margin: 'auto 0' }}>
                        No devotion
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Only the rounds this month actually contains: a legend listing every
                round in the ministry would be mostly colours you cannot see. */}
            {(() => {
              const present = new Map<string, RoundMeta>()
              for (const cell of monthCells) {
                const day = byDate.get(cell.iso)
                const round = day ? roundOfBook(day.book_id) : undefined
                if (round) present.set(round.id, round)
              }
              if (present.size === 0) return null
              return (
                <div
                  className="cal-legend"
                  style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}
                >
                  {[...present.values()].map((r) => (
                    <span className="key" key={r.id}>
                      <i style={{ background: roundHex(r.colour) }} />
                      {roundName(r)}
                    </span>
                  ))}
                  <span className="faint" style={{ marginLeft: 'auto' }}>
                    Colour is set on the round, in the library.
                  </span>
                </div>
              )
            })()}

            <p className="faint" style={{ fontSize: 11, margin: '12px 0 0' }}>
              Ethiopian months are exactly thirty days, so the grid is six by five &mdash; there
              are no ragged week edges to read past. Pagume, the thirteenth month, is five or six
              days and gets its own short row. Click any date to preview it.
            </p>
          </div>
        </section>

        <section className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head">
            <h2 className="card-title">Undated days</h2>
            <span
              className={`pill ${unscheduled.length ? 'in_review' : 'published'}`}
              style={{ marginLeft: 'auto' }}
            >
              {unscheduled.length}
            </span>
          </div>
          <div className="card-body" style={{ padding: '11px 12px' }}>
            {unscheduled.length === 0 ? (
              <p className="faint" style={{ fontSize: 11.5, margin: 0 }}>
                Every written day has a date. Nothing is sitting invisible.
              </p>
            ) : (
              <>
                <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px' }}>
                  Written but never shown to anyone. Give each one a date from its book&rsquo;s page.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unscheduled.slice(0, 6).map((day) => (
                    <Link
                      key={day.id}
                      href={`/days/${day.id}`}
                      style={{
                        border: '1px solid var(--line)',
                        borderRadius: 7,
                        padding: '7px 9px',
                        background: 'var(--surface-2)',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'flex-start',
                        color: 'inherit',
                      }}
                    >
                      <span className="mono faint" style={{ fontSize: 11, marginTop: 1 }}>
                        {day.day_number}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: 'block',
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: 'var(--ink-2)',
                            lineHeight: 1.35,
                          }}
                        >
                          {day.topic_en || `Day ${day.day_number}`}
                        </span>
                        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)' }}>
                          {bookById.get(day.book_id)?.title_en}
                        </span>
                      </span>
                    </Link>
                  ))}
                  {unscheduled.length > 6 && (
                    <div className="faint" style={{ fontSize: 11, textAlign: 'center', padding: '6px 0' }}>
                      + {unscheduled.length - 6} more
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {preview && <DayDrawer target={preview} onClose={() => setPreview(null)} />}
    </>
  )
}

function Stat({
  label,
  value,
  foot,
  tone,
}: {
  label: string
  value: number
  foot: string
  tone?: 'crit' | 'warn' | undefined
}) {
  const color = tone ? `var(--${tone})` : undefined
  return (
    <div>
      <div className="eyebrow" style={{ color }}>
        {label}
      </div>
      <div className="kpi-value" style={{ fontSize: 22, color }}>
        {value}
      </div>
      <div className="kpi-foot" style={{ color }}>
        {foot}
      </div>
    </div>
  )
}
