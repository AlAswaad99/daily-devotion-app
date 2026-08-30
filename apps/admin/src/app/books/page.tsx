'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db, recordRevision, type ContentStatus } from '../../lib/db'
import { useSession, type AdminProfile } from '../../lib/session'
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
  main_verse_en: string
  starts_on: string
  status: 'draft' | 'published' | 'archived'
  church_id: string
}

type Tally = Record<string, { total: number; missing: number; scheduled: number }>

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

/** draft → in_review → published. Publishing is the only step that reaches readers. */
const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  draft: 'in_review',
  in_review: 'published',
}
const ACTION_LABEL: Partial<Record<ContentStatus, string>> = {
  draft: 'Send for review',
  in_review: 'Publish',
}

async function fetchContent() {
  const [{ data: r }, { data: b }, { data: days }] = await Promise.all([
    db
      .from('rounds')
      .select('id, phase_code, round_code, main_verse_en, starts_on, status, church_id')
      .order('phase_code')
      .order('round_code'),
    db
      .from('books')
      .select('id, round_id, sequence, source_id, title_en, title_am, status, church_id')
      .order('sequence'),
    db
      .from('devotion_days')
      .select('book_id, kind, topic_en, topic_am, purpose_en, purpose_am, scheduled_date'),
  ])

  const counts: Tally = {}
  for (const day of (days as Array<Record<string, string | null>> | null) ?? []) {
    const entry = (counts[day.book_id!] ??= { total: 0, missing: 0, scheduled: 0 })
    entry.total += 1
    if (isIncomplete(day as Record<string, string>)) entry.missing += 1
    if (day.scheduled_date) entry.scheduled += 1
  }

  return {
    rounds: (r as RoundRow[] | null) ?? [],
    books: (b as BookRow[] | null) ?? [],
    counts,
  }
}

export default function Content() {
  return (
    <RequireAdmin>
      <ContentInner />
    </RequireAdmin>
  )
}

function ContentInner() {
  const { profile } = useSession()
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [books, setBooks] = useState<BookRow[]>([])
  const [counts, setCounts] = useState<Tally>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [creatingRound, setCreatingRound] = useState(false)
  const [creatingBookIn, setCreatingBookIn] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const data = await fetchContent()
    setRounds(data.rounds)
    setBooks(data.books)
    setCounts(data.counts)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchContent()
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

  const advanceBook = async (book: BookRow) => {
    const next = NEXT_STATUS[book.status]
    if (!next || !profile) return

    if (next === 'published') {
      const tally = counts[book.id] ?? { total: 0, missing: 0, scheduled: 0 }
      const warnings = [
        tally.missing > 0 ? `${tally.missing} day(s) are missing a translation` : null,
        tally.scheduled < tally.total
          ? `${tally.total - tally.scheduled} day(s) have no date and will stay invisible`
          : null,
      ].filter(Boolean)

      const message = warnings.length
        ? `${warnings.join('. ')}.\n\nPublishing makes this book visible to everyone. Publish anyway?`
        : 'Publishing makes this book visible to everyone in the ministry. Continue?'
      if (!window.confirm(message)) return
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

  const publishRound = async (round: RoundRow) => {
    if (!profile || round.status === 'published') return
    setBusy(round.id)
    await db.from('rounds').update({ status: 'published' }).eq('id', round.id)
    await recordRevision({
      churchId: round.church_id,
      entityType: 'round',
      entityId: round.id,
      status: 'published',
      authorId: profile.id,
    })
    await refresh()
    setBusy(null)
  }

  // A phase is a grouping code on the round, not a record of its own — the
  // ministry's own exports treat it that way, and everything a phase might carry
  // (the main verse, the start date) already belongs to the round.
  const phases = [...new Set(rounds.map((r) => r.phase_code))].sort()

  return (
    <>
      <div className="page-head">
        <div className="spread">
          <div>
            <h2>Content</h2>
            <p className="sub">
              Phases hold rounds, rounds hold books, books hold days. Everything starts
              as a draft; publishing is the only step that reaches readers.
            </p>
          </div>
          <div className="row">
            <Link href="/books/import" className="button">
              Import JSON
            </Link>
            <button className="primary" onClick={() => setCreatingRound((v) => !v)}>
              {creatingRound ? 'Cancel' : 'New round'}
            </button>
          </div>
        </div>
      </div>

      {creatingRound && profile && (
        <NewRoundForm
          profile={profile}
          existingPhases={phases}
          onDone={async () => {
            setCreatingRound(false)
            await refresh()
          }}
        />
      )}

      {phases.length === 0 && !creatingRound && (
        <div className="card">
          <strong>No content yet</strong>
          <p className="sub" style={{ margin: '.3rem 0 .8rem' }}>
            Create a round by hand, or import the ministry&rsquo;s JSON and adjust it
            afterwards.
          </p>
          <div className="row">
            <button className="primary" onClick={() => setCreatingRound(true)}>
              New round
            </button>
            <Link href="/books/import" className="button">
              Import JSON
            </Link>
          </div>
        </div>
      )}

      {phases.map((phase) => (
        <section key={phase} style={{ marginBottom: '2rem' }}>
          <div className="eyebrow" style={{ marginBottom: '.5rem' }}>
            Phase {phase}
          </div>

          {rounds
            .filter((r) => r.phase_code === phase)
            .map((round) => {
              const roundBooks = books.filter((b) => b.round_id === round.id)
              return (
                <div key={round.id} className="card" style={{ marginBottom: '.8rem' }}>
                  <div className="spread" style={{ marginBottom: '.7rem' }}>
                    <div>
                      <strong>Round {round.round_code}</strong>{' '}
                      <span className={`pill ${round.status}`}>{round.status}</span>
                      <div className="muted" style={{ fontSize: '.8rem' }}>
                        Starts {formatEthiopic(round.starts_on, 'en')}
                        <span className="mono"> · {round.starts_on}</span>
                        {' · '}
                        {roundBooks.length} book{roundBooks.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="row">
                      {round.status !== 'published' && (
                        <button
                          className="small"
                          disabled={busy === round.id}
                          onClick={() => void publishRound(round)}
                        >
                          Publish round
                        </button>
                      )}
                      <button
                        className="small"
                        onClick={() =>
                          setCreatingBookIn(creatingBookIn === round.id ? null : round.id)
                        }
                      >
                        {creatingBookIn === round.id ? 'Cancel' : 'Add book'}
                      </button>
                    </div>
                  </div>

                  {creatingBookIn === round.id && profile && (
                    <NewBookForm
                      profile={profile}
                      round={round}
                      nextSequence={Math.max(0, ...roundBooks.map((b) => b.sequence)) + 1}
                      onDone={async () => {
                        setCreatingBookIn(null)
                        await refresh()
                      }}
                    />
                  )}

                  {roundBooks.length === 0 ? (
                    <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                      No books in this round yet.
                    </p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '2rem' }}>#</th>
                          <th>Title</th>
                          <th style={{ width: '9rem' }}>Days</th>
                          <th style={{ width: '7rem' }}>Status</th>
                          <th style={{ width: '9rem' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {roundBooks.map((book) => {
                          const tally = counts[book.id] ?? { total: 0, missing: 0, scheduled: 0 }
                          return (
                            <tr key={book.id}>
                              <td className="muted">{book.sequence}</td>
                              <td>
                                <Link href={`/books/${book.id}`}>
                                  {book.title_en || '(untitled)'}
                                </Link>
                                <div className="muted" lang="am" style={{ fontSize: '.85rem' }}>
                                  {book.title_am}
                                </div>
                              </td>
                              <td>
                                {tally.total}
                                {tally.missing > 0 && (
                                  <div className="problem" style={{ fontSize: '.75rem' }}>
                                    {tally.missing} untranslated
                                  </div>
                                )}
                                {tally.scheduled < tally.total && (
                                  <div style={{ fontSize: '.75rem', color: 'var(--warn)' }}>
                                    {tally.total - tally.scheduled} unscheduled
                                  </div>
                                )}
                              </td>
                              <td>
                                <span className={`pill ${book.status}`}>{book.status}</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {NEXT_STATUS[book.status] && (
                                  <button
                                    className="small"
                                    disabled={busy === book.id}
                                    onClick={() => void advanceBook(book)}
                                  >
                                    {ACTION_LABEL[book.status]}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
        </section>
      ))}
    </>
  )
}

function NewRoundForm({
  profile, existingPhases, onDone,
}: {
  profile: AdminProfile
  existingPhases: string[]
  onDone: () => Promise<void>
}) {
  const [phase, setPhase] = useState(existingPhases.at(-1) ?? '01')
  const [code, setCode] = useState('01')
  const [startsOn, setStartsOn] = useState(new Date().toISOString().slice(0, 10))
  const [verseEn, setVerseEn] = useState('')
  const [verseAm, setVerseAm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error } = await db.from('rounds').insert({
      church_id: profile.church_id,
      ministry_id: profile.ministry_id,
      phase_code: phase.trim(),
      round_code: code.trim(),
      main_verse_en: verseEn,
      main_verse_am: verseAm,
      starts_on: startsOn,
      status: 'draft',
    })

    setBusy(false)
    if (error) {
      setError(
        error.code === '23505' ? `Phase ${phase} round ${code} already exists.` : error.message,
      )
      return
    }
    await onDone()
  }

  return (
    <form className="card stack" style={{ marginBottom: '1.25rem' }} onSubmit={submit}>
      <strong>New round</strong>
      <div className="grid-4">
        <label>
          Phase code
          {/* Typing a code that does not exist yet is how a phase comes into being. */}
          <input
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            list="phase-codes"
            required
          />
          <datalist id="phase-codes">
            {existingPhases.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label>
          Round code
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label>
          First day
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </label>
        <div style={{ alignSelf: 'end' }} className="muted">
          {formatEthiopic(startsOn, 'en')}
        </div>
      </div>

      <div className="bilingual">
        <label>
          Main verse (English)
          <textarea value={verseEn} onChange={(e) => setVerseEn(e.target.value)} />
        </label>
        <label>
          ዋና ጥቅስ (አማርኛ)
          <textarea lang="am" value={verseAm} onChange={(e) => setVerseAm(e.target.value)} />
        </label>
      </div>

      {error && <p className="problem">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create round'}
        </button>
        <span className="muted" style={{ fontSize: '.8rem' }}>
          Created as a draft — invisible to readers until published.
        </span>
      </div>
    </form>
  )
}

function NewBookForm({
  profile, round, nextSequence, onDone,
}: {
  profile: AdminProfile
  round: RoundRow
  nextSequence: number
  onDone: () => Promise<void>
}) {
  const [titleEn, setTitleEn] = useState('')
  const [titleAm, setTitleAm] = useState('')
  const [sequence, setSequence] = useState(nextSequence)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const { error } = await db.from('books').insert({
      church_id: profile.church_id,
      round_id: round.id,
      sequence,
      // Mirrors the ministry's own identifier scheme so a later import can match it.
      source_id: `BOOK ${String(sequence).padStart(2, '0')}`,
      title_en: titleEn,
      title_am: titleAm,
      status: 'draft',
    })

    setBusy(false)
    if (error) {
      setError(
        error.code === '23505' ? `This round already has a book ${sequence}.` : error.message,
      )
      return
    }
    await onDone()
  }

  return (
    <form
      className="card stack"
      style={{ marginBottom: '.8rem', background: 'var(--surface-sunk)' }}
      onSubmit={submit}
    >
      <strong style={{ fontSize: '.9rem' }}>New book in round {round.round_code}</strong>
      <div className="bilingual">
        <label>
          Title (English)
          <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} required />
        </label>
        <label>
          ርዕስ (አማርኛ)
          <input lang="am" value={titleAm} onChange={(e) => setTitleAm(e.target.value)} required />
        </label>
      </div>
      <label style={{ maxWidth: '8rem' }}>
        Order in round
        <input
          type="number"
          min={1}
          value={sequence}
          onChange={(e) => setSequence(Number(e.target.value))}
        />
      </label>
      {error && <p className="problem">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create book'}
        </button>
      </div>
    </form>
  )
}
