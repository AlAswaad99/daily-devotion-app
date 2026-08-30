'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db, type ContentStatus } from '../../../lib/db'
import { RequireAdmin } from '../../../components/RequireAdmin'

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

export default function BookDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RequireAdmin>
      <BookDetailInner bookId={id} />
    </RequireAdmin>
  )
}

function BookDetailInner({ bookId }: { bookId: string }) {
  const [title, setTitle] = useState<{ en: string; am: string } | null>(null)
  const [days, setDays] = useState<DayRow[]>([])

  const load = useCallback(async () => {
    const [{ data: book }, { data: rows }] = await Promise.all([
      db.from('books').select('title_en, title_am').eq('id', bookId).maybeSingle(),
      db
        .from('devotion_days')
        .select(
          'id, day_number, kind, topic_en, topic_am, purpose_en, purpose_am, scheduled_date, status',
        )
        .eq('book_id', bookId)
        .order('day_number'),
    ])
    const b = book as { title_en: string; title_am: string } | null
    return {
      title: b ? { en: b.title_en, am: b.title_am } : null,
      days: (rows as DayRow[] | null) ?? [],
    }
  }, [bookId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await load()
      if (!cancelled) {
        setTitle(data.title)
        setDays(data.days)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const incomplete = (day: DayRow) =>
    !day.topic_en.trim() || !day.topic_am.trim() ||
    !day.purpose_en.trim() || !day.purpose_am.trim()

  return (
    <>
      <h2>{title?.en ?? 'Book'}</h2>
      <p className="sub" lang="am">
        {title?.am}
      </p>

      <table>
        <thead>
          <tr>
            <th>Day</th>
            <th>Topic</th>
            <th>Scheduled</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.id}>
              <td className="muted">
                {day.kind === 'summary' ? '★' : day.day_number}
              </td>
              <td>
                <Link href={`/days/${day.id}`}>{day.topic_en || '(untitled)'}</Link>
                <div className="muted" lang="am" style={{ fontSize: '.85rem' }}>
                  {day.topic_am}
                </div>
                {incomplete(day) && (
                  <div className="problem" style={{ fontSize: '.8rem' }}>
                    Missing a translation
                  </div>
                )}
              </td>
              <td>
                {day.scheduled_date ? (
                  <>
                    {formatEthiopic(day.scheduled_date, 'en')}
                    {/* Ethiopian for reading, Gregorian underneath for certainty. */}
                    <div className="muted mono">{day.scheduled_date}</div>
                  </>
                ) : (
                  <span className="muted">not scheduled</span>
                )}
              </td>
              <td>
                <span className={`pill ${day.status}`}>{day.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
