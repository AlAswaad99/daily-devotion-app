'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db, type ContentStatus } from '../../../lib/db'
import { useSession, type AdminProfile } from '../../../lib/session'
import { RequireAdmin } from '../../../components/RequireAdmin'
import { isIncomplete } from '../page'

interface DayRow {
  id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  topic_am: string
  purpose_en: string
  purpose_am: string
  scheduled_date: string | null
  status: ContentStatus
}

interface BookInfo {
  id: string
  round_id: string
  church_id: string
  title_en: string
  title_am: string
  status: ContentStatus
}

async function fetchBook(bookId: string) {
  const [{ data: book }, { data: rows }] = await Promise.all([
    db
      .from('books')
      .select('id, round_id, church_id, title_en, title_am, status')
      .eq('id', bookId)
      .maybeSingle(),
    db
      .from('devotion_days')
      .select(
        'id, day_number, kind, topic_en, topic_am, purpose_en, purpose_am, scheduled_date, status',
      )
      .eq('book_id', bookId)
      .order('day_number'),
  ])

  return {
    book: (book as BookInfo | null) ?? null,
    days: (rows as DayRow[] | null) ?? [],
  }
}

export default function BookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RequireAdmin>
      <BookDetailInner bookId={id} />
    </RequireAdmin>
  )
}

function BookDetailInner({ bookId }: { bookId: string }) {
  const { profile } = useSession()
  const [book, setBook] = useState<BookInfo | null>(null)
  const [days, setDays] = useState<DayRow[]>([])
  const [adding, setAdding] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await fetchBook(bookId)
    setBook(data.book)
    setDays(data.days)
  }, [bookId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchBook(bookId)
      if (!cancelled) {
        setBook(data.book)
        setDays(data.days)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [bookId])

  /**
   * Assign consecutive dates from a chosen start. Days run every calendar day
   * including Sundays, and only one day may occupy a date per church — so a clash
   * is reported rather than silently skipped.
   */
  const scheduleFrom = async (start: string) => {
    setBusy(true)
    setError(null)

    const cursor = new Date(`${start}T00:00:00Z`)
    for (const day of [...days].sort((a, b) => a.day_number - b.day_number)) {
      const date = cursor.toISOString().slice(0, 10)
      const { error } = await db
        .from('devotion_days')
        .update({ scheduled_date: date })
        .eq('id', day.id)

      if (error) {
        setError(
          error.code === '23505'
            ? `${date} already has a devotion. The ministry reads one day at a time, so pick a start date after the current round ends.`
            : error.message,
        )
        setBusy(false)
        await refresh()
        return
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    setBusy(false)
    setScheduling(false)
    await refresh()
  }

  if (!book) return <p className="muted">Loading…</p>

  const scheduled = days.filter((d) => d.scheduled_date)
  const incomplete = days.filter((d) => isIncomplete(d)).length

  return (
    <>
      <div className="page-head">
        <div className="spread">
          <div>
            <h2>{book.title_en || '(untitled book)'}</h2>
            <p className="sub" lang="am">
              {book.title_am}
            </p>
            <div className="row" style={{ marginTop: '.4rem' }}>
              <span className={`pill ${book.status}`}>{book.status}</span>
              <span className="muted" style={{ fontSize: '.82rem' }}>
                {days.length} day{days.length === 1 ? '' : 's'} · {scheduled.length} scheduled
                {incomplete > 0 && (
                  <span className="problem"> · {incomplete} untranslated</span>
                )}
              </span>
            </div>
          </div>
          <div className="row">
            <Link href="/books" className="button">
              ← All content
            </Link>
            <button onClick={() => setScheduling((v) => !v)}>
              {scheduling ? 'Cancel' : 'Schedule days'}
            </button>
            <button className="primary" onClick={() => setAdding((v) => !v)}>
              {adding ? 'Cancel' : 'Add day'}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="problem">{error}</p>}

      {scheduling && (
        <ScheduleForm days={days.length} busy={busy} onSubmit={scheduleFrom} />
      )}

      {adding && profile && (
        <NewDayForm
          profile={profile}
          bookId={bookId}
          nextNumber={Math.max(0, ...days.map((d) => d.day_number)) + 1}
          onDone={async () => {
            setAdding(false)
            await refresh()
          }}
        />
      )}

      {days.length === 0 ? (
        <div className="card">
          <strong>No days yet</strong>
          <p className="sub" style={{ margin: '.3rem 0 0' }}>
            Add them one at a time, or import the ministry&rsquo;s JSON from{' '}
            <Link href="/books/import">Import</Link>.
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: '3rem' }}>Day</th>
              <th>Topic</th>
              <th style={{ width: '12rem' }}>Scheduled</th>
              <th style={{ width: '7rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.id}>
                <td className="muted">{day.kind === 'summary' ? '★' : day.day_number}</td>
                <td>
                  <Link href={`/days/${day.id}`}>{day.topic_en || '(untitled)'}</Link>
                  <div className="muted" lang="am" style={{ fontSize: '.85rem' }}>
                    {day.topic_am}
                  </div>
                  {isIncomplete(day) && (
                    <div className="problem" style={{ fontSize: '.78rem' }}>
                      Missing a translation
                    </div>
                  )}
                </td>
                <td>
                  {day.scheduled_date ? (
                    <>
                      {formatEthiopic(day.scheduled_date, 'en')}
                      {/* Ethiopian for reading, Gregorian beneath for certainty. */}
                      <div className="mono">{day.scheduled_date}</div>
                    </>
                  ) : (
                    <span style={{ color: 'var(--warn)' }}>not scheduled</span>
                  )}
                </td>
                <td>
                  <span className={`pill ${day.status}`}>{day.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function ScheduleForm({
  days, busy, onSubmit,
}: {
  days: number
  busy: boolean
  onSubmit: (start: string) => Promise<void>
}) {
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10))

  const end = (() => {
    const d = new Date(`${start}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + Math.max(0, days - 1))
    return d.toISOString().slice(0, 10)
  })()

  return (
    <div className="card stack" style={{ marginBottom: '1.25rem' }}>
      <strong>Schedule {days} day{days === 1 ? '' : 's'}</strong>
      <div className="row" style={{ alignItems: 'end', gap: '1rem' }}>
        <label style={{ maxWidth: '12rem' }}>
          Starting on
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <div className="muted" style={{ fontSize: '.85rem' }}>
          {formatEthiopic(start, 'en')} → {formatEthiopic(end, 'en')}
          <div className="mono">
            {start} → {end}
          </div>
        </div>
        <button className="primary" disabled={busy} onClick={() => void onSubmit(start)}>
          {busy ? 'Scheduling…' : 'Assign dates'}
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
        Consecutive days including Sundays. Days already scheduled will be moved.
      </p>
    </div>
  )
}

function NewDayForm({
  profile, bookId, nextNumber, onDone,
}: {
  profile: AdminProfile
  bookId: string
  nextNumber: number
  onDone: () => Promise<void>
}) {
  const [dayNumber, setDayNumber] = useState(nextNumber)
  const [kind, setKind] = useState<'devotion' | 'summary'>('devotion')
  const [topicEn, setTopicEn] = useState('')
  const [topicAm, setTopicAm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error } = await db.from('devotion_days').insert({
      church_id: profile.church_id,
      book_id: bookId,
      day_number: dayNumber,
      kind,
      topic_en: topicEn,
      topic_am: topicAm,
      status: 'draft',
    })

    setBusy(false)
    if (error) {
      setError(
        error.code === '23505' ? `This book already has a day ${dayNumber}.` : error.message,
      )
      return
    }
    await onDone()
  }

  return (
    <form className="card stack" style={{ marginBottom: '1.25rem' }} onSubmit={submit}>
      <strong>New day</strong>
      <div className="row" style={{ alignItems: 'end', gap: '1rem' }}>
        <label style={{ maxWidth: '7rem' }}>
          Day number
          <input
            type="number"
            min={1}
            value={dayNumber}
            onChange={(e) => setDayNumber(Number(e.target.value))}
          />
        </label>
        <label style={{ maxWidth: '11rem' }}>
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as 'devotion' | 'summary')}>
            <option value="devotion">Devotion</option>
            <option value="summary">Summary questions</option>
          </select>
        </label>
        <span className="muted" style={{ fontSize: '.8rem' }}>
          {kind === 'summary'
            ? 'A summary day counts toward the streak like any other, and holds the book’s closing questions.'
            : ''}
        </span>
      </div>

      <div className="bilingual">
        <label>
          Topic (English)
          <input value={topicEn} onChange={(e) => setTopicEn(e.target.value)} required />
        </label>
        <label>
          ርዕስ (አማርኛ)
          <input lang="am" value={topicAm} onChange={(e) => setTopicAm(e.target.value)} required />
        </label>
      </div>

      {error && <p className="problem">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create day'}
        </button>
        <span className="muted" style={{ fontSize: '.8rem' }}>
          The body, prayer and references are edited on the day itself.
        </span>
      </div>
    </form>
  )
}
