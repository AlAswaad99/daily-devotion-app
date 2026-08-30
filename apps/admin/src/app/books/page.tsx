'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db, recordRevision, type ContentStatus } from '../../lib/db'
import { useSession } from '../../lib/session'
import { RequireAdmin } from '../../components/RequireAdmin'

interface BookRow {
  id: string
  round_id: string
  sequence: number
  source_id: string
  title_en: string
  title_am: string
  status: ContentStatus
  church_id: string
}

interface RoundRow {
  id: string
  phase_code: string
  round_code: string
  starts_on: string
  status: string
}

type Tally = Record<string, { total: number; missing: number }>

/**
 * A summary day carries no purpose or prayer — its content is the book's closing
 * questions, which live in their own table. Judging it by a devotion's fields
 * flagged every book as having one incomplete day, which trains an editor to
 * ignore the warning entirely.
 */
export function isIncomplete(day: {
  kind?: string
  topic_en?: string
  topic_am?: string
  purpose_en?: string
  purpose_am?: string
}): boolean {
  if (!day.topic_en?.trim() || !day.topic_am?.trim()) return true
  if (day.kind === 'summary') return false
  return !day.purpose_en?.trim() || !day.purpose_am?.trim()
}

/**
 * draft → in_review → published. Publishing is the only action that makes content
 * visible to users, so it is the only one that asks twice.
 */
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  draft: 'in_review',
  in_review: 'published',
}

const ACTION_LABEL: Partial<Record<ContentStatus, string>> = {
  draft: 'Send for review',
  in_review: 'Publish',
}

/** Fetchers return data and set nothing; the effect owns the state. */
async function fetchBooks(): Promise<{ rounds: RoundRow[]; books: BookRow[]; counts: Tally }> {
  const [{ data: r }, { data: b }, { data: days }] = await Promise.all([
    db.from('rounds').select('id, phase_code, round_code, starts_on, status').order('starts_on'),
    db
      .from('books')
      .select('id, round_id, sequence, source_id, title_en, title_am, status, church_id')
      .order('sequence'),
    db.from('devotion_days').select('book_id, kind, topic_en, topic_am, purpose_en, purpose_am'),
  ])

  // A missing translation is caught here rather than degrading silently in the app,
  // which has no fallback chain by design.
  const counts: Tally = {}
  for (const day of (days as Array<Record<string, string>> | null) ?? []) {
    const entry = (counts[day.book_id!] ??= { total: 0, missing: 0 })
    entry.total += 1
    if (isIncomplete(day)) entry.missing += 1
  }

  return {
    rounds: (r as RoundRow[] | null) ?? [],
    books: (b as BookRow[] | null) ?? [],
    counts,
  }
}

export default function Books() {
  return (
    <RequireAdmin>
      <BooksInner />
    </RequireAdmin>
  )
}

function BooksInner() {
  const { profile } = useSession()
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [books, setBooks] = useState<BookRow[]>([])
  const [counts, setCounts] = useState<Tally>({})
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await fetchBooks()
    setRounds(data.rounds)
    setBooks(data.books)
    setCounts(data.counts)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchBooks()
      if (!cancelled) {
        setRounds(data.rounds)
        setBooks(data.books)
        setCounts(data.counts)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const advance = async (book: BookRow) => {
    const next = NEXT_STATUS[book.status]
    if (!next || !profile) return

    if (next === 'published') {
      const missing = counts[book.id]?.missing ?? 0
      const confirmed = window.confirm(
        missing > 0
          ? `${missing} day(s) in this book are missing a translation. Publishing makes it visible to everyone. Publish anyway?`
          : 'Publishing makes this book visible to everyone in the ministry. Continue?',
      )
      if (!confirmed) return
    }

    setBusy(book.id)
    const { error } = await db.from('books').update({ status: next }).eq('id', book.id)
    if (!error) {
      await recordRevision({
        churchId: book.church_id,
        entityType: 'book',
        entityId: book.id,
        status: next,
        authorId: profile.id,
        payload: { title_en: book.title_en, from: book.status },
      })
      await refresh()
    }
    setBusy(null)
  }

  return (
    <>
      <div className="page-head">
        <h2>Books &amp; days</h2>
        <p className="sub">
          Content moves draft → in review → published. Only publishing makes it visible
          to readers.
        </p>
      </div>

      {rounds.map((round) => (
        <section key={round.id} className="stack" style={{ marginBottom: '2rem' }}>
          <div className="spread">
            <div>
              <strong>
                Phase {round.phase_code} · Round {round.round_code}
              </strong>
              <div className="muted" style={{ fontSize: '.82rem' }}>
                Starts {formatEthiopic(round.starts_on, 'en')}
                <span className="muted"> · {round.starts_on}</span>
              </div>
            </div>
            <span className={`pill ${round.status}`}>{round.status}</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Days</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {books
                .filter((b) => b.round_id === round.id)
                .map((book) => {
                  const tally = counts[book.id] ?? { total: 0, missing: 0 }
                  return (
                    <tr key={book.id}>
                      <td className="muted">{book.sequence}</td>
                      <td>
                        <Link href={`/books/${book.id}`}>{book.title_en}</Link>
                        <div className="muted" lang="am" style={{ fontSize: '.85rem' }}>
                          {book.title_am}
                        </div>
                      </td>
                      <td>
                        {tally.total}
                        {tally.missing > 0 && (
                          <span className="problem"> · {tally.missing} incomplete</span>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${book.status}`}>{book.status}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {NEXT_STATUS[book.status] && (
                          <button disabled={busy === book.id} onClick={() => void advance(book)}>
                            {ACTION_LABEL[book.status]}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </section>
      ))}

      {rounds.length === 0 && (
        <div className="card">
          <p className="muted">
            No rounds yet. Use <Link href="/import">Import</Link> to load the ministry&rsquo;s
            JSON.
          </p>
        </div>
      )}
    </>
  )
}
