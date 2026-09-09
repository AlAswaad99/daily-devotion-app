'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db, recordRevision, type ContentStatus } from '../../lib/db'
import { useSession, type AdminProfile } from '../../lib/session'
import { RequireAdmin } from '../../components/RequireAdmin'
import { ConfirmDelete } from '../../components/InlineEdit'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useToast } from '../../components/Toast'
import { archiveBook, archiveRound, restoreBook, restoreRound } from '../../lib/archive'
import { publishBook, publishRound } from '../../lib/publish'
import { ROUND_COLOURS, roundHex, roundLabel, suggestColour, type RoundColour } from '../../lib/round-colours'

interface PhaseRow {
  id: string
  code: string
  title_en: string
  title_am: string
}

interface RoundRow {
  id: string
  phase_id: string | null
  phase_code: string
  round_code: string
  main_verse_en: string
  main_verse_am: string
  starts_on: string
  status: 'draft' | 'published' | 'archived'
  colour: string
  church_id: string
}

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

type Tally = Record<string, { total: number; missing: number; scheduled: number }>

export function isIncomplete(day: {
  kind?: string
  topic_en?: string
  topic_am?: string
  purpose_en?: string
  purpose_am?: string
}): boolean {
  if (!day.topic_en?.trim() || !day.topic_am?.trim()) return true
  // A summary day's content is the book's closing questions, not a purpose.
  if (day.kind === 'summary') return false
  return !day.purpose_en?.trim() || !day.purpose_am?.trim()
}

const NEXT_STATUS: Partial<Record<ContentStatus, ContentStatus>> = {
  draft: 'in_review',
  in_review: 'published',
}
const ACTION_LABEL: Partial<Record<ContentStatus, string>> = {
  draft: 'Send for review',
  in_review: 'Publish',
}

/** The database refuses unsafe deletes; this turns its message into a sentence. */
const explain = (error: { code?: string; message: string } | null): string | null =>
  error ? error.message.replace(/^.*?:\s*/, '') : null

/** The day after the last scheduled devotion — where the next round naturally begins. */
export function dayAfter(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function fetchContent() {
  const [{ data: p }, { data: r }, { data: b }, { data: days }] = await Promise.all([
    db.from('phases').select('id, code, title_en, title_am').order('code'),
    db
      .from('rounds')
      .select(
        'id, phase_id, phase_code, round_code, main_verse_en, main_verse_am, starts_on, status, colour, church_id',
      )
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

  // Rounds run back to back, so the next one starts the day after the last
  // scheduled devotion rather than today.
  const scheduledDates = ((days as Array<Record<string, string | null>> | null) ?? [])
    .map((d) => d.scheduled_date)
    .filter((d): d is string => Boolean(d))
    .sort()

  return {
    phases: (p as PhaseRow[] | null) ?? [],
    rounds: (r as RoundRow[] | null) ?? [],
    books: (b as BookRow[] | null) ?? [],
    counts,
    lastScheduled: scheduledDates.at(-1) ?? null,
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
  const { push } = useToast()
  const [phases, setPhases] = useState<PhaseRow[]>([])
  const [rounds, setRounds] = useState<RoundRow[]>([])
  const [books, setBooks] = useState<BookRow[]>([])
  const [counts, setCounts] = useState<Tally>({})
  const [lastScheduled, setLastScheduled] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [creatingPhase, setCreatingPhase] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [creatingRoundIn, setCreatingRoundIn] = useState<string | null>(null)
  const [creatingBookIn, setCreatingBookIn] = useState<string | null>(null)
  // Active rounds/books hide their archived siblings; the toggle below switches
  // to seeing only what has been retired.
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [publishingBook, setPublishingBook] = useState<BookRow | null>(null)
  const [archivingRound, setArchivingRound] = useState<RoundRow | null>(null)
  const [restoringRound, setRestoringRound] = useState<RoundRow | null>(null)
  const [archivingBook, setArchivingBook] = useState<BookRow | null>(null)
  const [restoringBook, setRestoringBook] = useState<BookRow | null>(null)

  const refresh = useCallback(async () => {
    const data = await fetchContent()
    setPhases(data.phases)
    setRounds(data.rounds)
    setBooks(data.books)
    setCounts(data.counts)
    setLastScheduled(data.lastScheduled)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchContent()
      if (!cancelled) {
        setPhases(data.phases)
        setRounds(data.rounds)
        setBooks(data.books)
        setCounts(data.counts)
        setLastScheduled(data.lastScheduled)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setStatus = async (
    table: 'rounds' | 'books',
    row: { id: string; church_id: string; status: string },
    status: ContentStatus,
  ): Promise<string | null> => {
    if (!profile) return null
    setBusy(row.id)
    const { error } = await db.from(table).update({ status }).eq('id', row.id)
    if (!error) {
      await recordRevision({
        churchId: row.church_id,
        entityType: table === 'books' ? 'book' : 'round',
        entityId: row.id,
        status,
        authorId: profile.id,
        payload: { from: row.status },
      })
      await refresh()
    }
    setBusy(null)
    return explain(error)
  }

  const advanceBook = async (book: BookRow) => {
    const next = NEXT_STATUS[book.status]
    if (!next) return

    if (next === 'published') {
      setPublishingBook(book)
      return
    }
    await setStatus('books', book, next)
  }

  /**
   * Unlike `setStatus`, this cascades to every book and day underneath. Also
   * doubles as "Sync days" on an already-published round — the cascade only
   * ever runs on a status *change*, so a round published before this existed
   * (or one an import touched afterward) has no other way to catch up.
   */
  const publishRoundNow = async (round: RoundRow) => {
    if (!profile) return
    const resync = round.status === 'published'
    setBusy(round.id)
    const message = await publishRound(round, profile.id)
    setBusy(null)
    if (message) {
      push('error', message)
      return
    }
    push('success', resync ? `Round ${round.round_code}'s days synced.` : `Round ${round.round_code} published.`)
    await refresh()
  }

  const remove = async (id: string) => {
    const { error } = await db.from('phases').delete().eq('id', id)
    if (error) return explain(error)
    await refresh()
    return null
  }

  // A round's own status and its books' statuses can disagree: a book can be
  // archived on its own while its round stays active, and restoring one book out
  // of an archived round leaves the round archived with one draft book inside. So
  // a round is visible in a view whenever it HAS a book that view would show —
  // not just when the round's own status matches — or neither view would ever be
  // able to display that book.
  const roundHasBookInView = (roundId: string, archived: boolean) =>
    books.some((b) => b.round_id === roundId && (b.status === 'archived') === archived)
  const roundVisible = (round: RoundRow) =>
    view === 'archived'
      ? round.status === 'archived' || roundHasBookInView(round.id, true)
      : round.status !== 'archived' || roundHasBookInView(round.id, false)
  const bookVisible = (book: BookRow) =>
    view === 'archived' ? book.status === 'archived' : book.status !== 'archived'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Library</h1>
          <p className="page-sub">
            Phases hold rounds, rounds hold books, books hold days. Everything starts as a
            draft; publishing is the only step that reaches readers. A round or book that has
            ever been published can only be archived, never deleted — archiving is reversible
            and keeps every streak and completion intact.
          </p>
        </div>
        <div className="head-actions">
          <div className="seg" role="tablist" aria-label="Content view">
            <button
              type="button"
              aria-pressed={view === 'active'}
              onClick={() => setView('active')}
            >
              Active
            </button>
            <button
              type="button"
              aria-pressed={view === 'archived'}
              onClick={() => setView('archived')}
            >
              Archived
            </button>
          </div>
          <Link href="/books/import" className="button">
            Import JSON
          </Link>
          <button className="primary" onClick={() => setCreatingPhase((v) => !v)}>
            {creatingPhase ? 'Cancel' : 'New phase'}
          </button>
        </div>
      </div>

      {creatingPhase && profile && (
        <PhaseForm
          profile={profile}
          onDone={async () => {
            setCreatingPhase(false)
            await refresh()
          }}
        />
      )}

      {phases.length === 0 && !creatingPhase && (
        <div className="card">
          <strong>No content yet</strong>
          <p className="sub" style={{ margin: '.3rem 0 .8rem' }}>
            Start with a phase, or import the ministry&rsquo;s JSON — importing creates
            the phase it names.
          </p>
          <div className="row">
            <button className="primary" onClick={() => setCreatingPhase(true)}>
              New phase
            </button>
            <Link href="/books/import" className="button">
              Import JSON
            </Link>
          </div>
        </div>
      )}

      {phases.map((phase) => {
        const allPhaseRounds = rounds.filter((r) => r.phase_id === phase.id)
        const phaseRounds = allPhaseRounds.filter(roundVisible)
        return (
          <section key={phase.id} style={{ marginBottom: '2rem' }}>
            <div
              className="spread"
              style={{ marginBottom: '.5rem', paddingBottom: '.35rem', borderBottom: '1px solid var(--line-2)' }}
            >
              <div>
                <span className="eyebrow">Phase {phase.code}</span>
                <div style={{ fontWeight: 600 }}>
                  {phase.title_en || <span className="faint">(untitled phase)</span>}
                  {phase.title_am && (
                    <span className="muted" lang="am" style={{ fontWeight: 400 }}>
                      {' · '}
                      {phase.title_am}
                    </span>
                  )}
                </div>
              </div>
              <div className="row">
                <button
                  className="small"
                  onClick={() => setEditing(editing === phase.id ? null : phase.id)}
                >
                  {editing === phase.id ? 'Cancel' : 'Edit'}
                </button>
                <button
                  className="small"
                  onClick={() =>
                    setCreatingRoundIn(creatingRoundIn === phase.id ? null : phase.id)
                  }
                >
                  {creatingRoundIn === phase.id ? 'Cancel' : 'Add round'}
                </button>
                <ConfirmDelete
                  label="phase"
                  name={phase.code}
                  onDelete={() => remove(phase.id)}
                />
              </div>
            </div>

            {editing === phase.id && profile && (
              <PhaseForm
                profile={profile}
                phase={phase}
                onDone={async () => {
                  setEditing(null)
                  await refresh()
                }}
              />
            )}

            {creatingRoundIn === phase.id && profile && (
              <RoundForm
                profile={profile}
                phaseId={phase.id}
                nextCode={String(allPhaseRounds.length + 1).padStart(2, '0')}
                lastScheduled={lastScheduled}
                takenColours={rounds.map((r) => r.colour)}
                onDone={async () => {
                  setCreatingRoundIn(null)
                  await refresh()
                }}
              />
            )}

            {phaseRounds.length === 0 ? (
              <p className="muted" style={{ fontSize: '.85rem' }}>
                {view === 'archived' ? 'Nothing archived in this phase.' : 'No rounds in this phase yet.'}
              </p>
            ) : (
              phaseRounds.map((round) => {
                const allRoundBooks = books.filter((b) => b.round_id === round.id)
                const roundBooks = allRoundBooks.filter(bookVisible)
                return (
                  <div key={round.id} className="card" style={{ marginBottom: '.8rem' }}>
                    <div className="spread" style={{ marginBottom: '.7rem' }}>
                      <div>
                        {/* The same chip the calendar draws down the side of a cell. */}
                        <span
                          className="round-chip"
                          style={{ background: roundHex(round.colour) }}
                          title={`${roundLabel(round.colour)} on the calendar`}
                        />
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
                        {round.status === 'draft' && (
                          <button
                            className="small"
                            disabled={busy === round.id}
                            onClick={() => void publishRoundNow(round)}
                          >
                            Publish round
                          </button>
                        )}
                        {round.status === 'published' && (
                          <>
                            <button
                              className="small"
                              disabled={busy === round.id}
                              title="Re-runs the publish cascade down to every book and day — fixes days left behind at draft (e.g. by an import after this round was already published)."
                              onClick={() => void publishRoundNow(round)}
                            >
                              Sync days
                            </button>
                            <button
                              className="small"
                              disabled={busy === round.id}
                              onClick={() => setArchivingRound(round)}
                            >
                              Archive
                            </button>
                          </>
                        )}
                        {round.status === 'archived' && (
                          <button
                            className="small"
                            disabled={busy === round.id}
                            onClick={() => setRestoringRound(round)}
                          >
                            Restore
                          </button>
                        )}
                        <button
                          className="small"
                          onClick={() =>
                            setEditing(editing === round.id ? null : round.id)
                          }
                        >
                          {editing === round.id ? 'Cancel' : 'Edit'}
                        </button>
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

                    {editing === round.id && profile && (
                      <RoundForm
                        profile={profile}
                        phaseId={phase.id}
                        round={round}
                        nextCode={round.round_code}
                        lastScheduled={lastScheduled}
                        takenColours={rounds.map((r) => r.colour)}
                        onDone={async () => {
                          setEditing(null)
                          await refresh()
                        }}
                      />
                    )}

                    {creatingBookIn === round.id && profile && (
                      <BookForm
                        profile={profile}
                        roundId={round.id}
                        nextSequence={Math.max(0, ...allRoundBooks.map((b) => b.sequence)) + 1}
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
                            <th style={{ width: '6rem' }}>Status</th>
                            <th style={{ width: '20rem' }} />
                          </tr>
                        </thead>
                        <tbody>
                          {roundBooks.map((book) => {
                            const tally = counts[book.id] ?? {
                              total: 0, missing: 0, scheduled: 0,
                            }
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
                                <td>
                                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                                    {NEXT_STATUS[book.status] && (
                                      <button
                                        className="small"
                                        disabled={busy === book.id}
                                        onClick={() => void advanceBook(book)}
                                      >
                                        {ACTION_LABEL[book.status]}
                                      </button>
                                    )}
                                    {book.status === 'published' && (
                                      <>
                                        <button
                                          className="small"
                                          disabled={busy === book.id}
                                          title="Re-runs the publish cascade down to every day — fixes days left behind at draft (e.g. by an import after this book was already published)."
                                          onClick={() => setPublishingBook(book)}
                                        >
                                          Sync days
                                        </button>
                                        <button
                                          className="small"
                                          disabled={busy === book.id}
                                          onClick={() => setArchivingBook(book)}
                                        >
                                          Archive
                                        </button>
                                      </>
                                    )}
                                    {book.status === 'archived' && (
                                      <button
                                        className="small"
                                        disabled={busy === book.id}
                                        onClick={() => setRestoringBook(book)}
                                      >
                                        Restore
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })
            )}
          </section>
        )
      })}

      {publishingBook && (() => {
        // "Sync days" opens this same modal on an already-published book — the
        // cascade only ever runs on a status *change*, so a book published before
        // that fix existed (or one an import touched afterward) has no other way
        // to bring its days back in line without this.
        const resync = publishingBook.status === 'published'
        const tally = counts[publishingBook.id] ?? { total: 0, missing: 0, scheduled: 0 }
        const warnings = [
          tally.missing > 0 ? `${tally.missing} day(s) are missing a translation.` : null,
          tally.scheduled < tally.total
            ? `${tally.total - tally.scheduled} day(s) have no date and will stay invisible.`
            : null,
        ].filter(Boolean)
        return (
          <ConfirmModal
            title={resync ? 'Sync days' : 'Publish book'}
            body={
              <>
                {warnings.map((w) => (
                  <p key={w} className="problem" style={{ margin: '0 0 6px' }}>
                    {w}
                  </p>
                ))}
                {resync
                  ? 'Publishes every day in this book that isn’t already, so they match the book’s own published status.'
                  : 'Publishing makes this book visible to everyone in the ministry.'}
              </>
            }
            confirmLabel={resync ? 'Sync days' : 'Publish'}
            onCancel={() => setPublishingBook(null)}
            onConfirm={async () => {
              if (!profile) return null
              const message = await publishBook(publishingBook, profile.id)
              if (!message) {
                setPublishingBook(null)
                push(
                  'success',
                  resync
                    ? `${publishingBook.title_en || publishingBook.source_id}'s days synced.`
                    : `${publishingBook.title_en || publishingBook.source_id} published.`,
                )
                await refresh()
              }
              return message
            }}
          />
        )
      })()}

      {archivingRound && profile && (
        <ConfirmModal
          title="Archive round"
          body="Archiving keeps this round and its books readable in the library and leaves every streak and completion intact — it simply stops being the current round. Every book underneath is archived with it."
          confirmLabel="Archive round"
          tone="danger"
          typeToConfirm={archivingRound.round_code}
          onCancel={() => setArchivingRound(null)}
          onConfirm={async () => {
            const message = await archiveRound(archivingRound, profile.id)
            if (!message) {
              setArchivingRound(null)
              push('success', `Round ${archivingRound.round_code} archived.`)
              await refresh()
            }
            return message
          }}
        />
      )}

      {restoringRound && profile && (
        <ConfirmModal
          title="Restore round"
          body="Brings this round and its books back as drafts — nothing publishes automatically. The “(Archived)” marker is removed from every book title."
          confirmLabel="Restore"
          onCancel={() => setRestoringRound(null)}
          onConfirm={async () => {
            const message = await restoreRound(restoringRound, profile.id)
            if (!message) {
              setRestoringRound(null)
              push('success', `Round ${restoringRound.round_code} restored as a draft.`)
              await refresh()
            }
            return message
          }}
        />
      )}

      {archivingBook && profile && (
        <ConfirmModal
          title="Archive book"
          body="Archiving keeps this book and its days readable and leaves every completion intact. It stops appearing in the active library."
          confirmLabel="Archive book"
          tone="danger"
          onCancel={() => setArchivingBook(null)}
          onConfirm={async () => {
            const message = await archiveBook(archivingBook, profile.id)
            if (!message) {
              setArchivingBook(null)
              push('success', `${archivingBook.title_en || archivingBook.source_id} archived.`)
              await refresh()
            }
            return message
          }}
        />
      )}

      {restoringBook && profile && (
        <ConfirmModal
          title="Restore book"
          body="Brings this book and its days back as a draft — nothing publishes automatically. The “(Archived)” marker is removed from its title."
          confirmLabel="Restore"
          onCancel={() => setRestoringBook(null)}
          onConfirm={async () => {
            const message = await restoreBook(restoringBook, profile.id)
            if (!message) {
              setRestoringBook(null)
              push('success', `${restoringBook.title_en || restoringBook.source_id} restored as a draft.`)
              await refresh()
            }
            return message
          }}
        />
      )}
    </>
  )
}

/** Create or edit — the same fields either way, so the same form. */
function PhaseForm({
  profile, phase, onDone,
}: {
  profile: AdminProfile
  phase?: PhaseRow
  onDone: () => Promise<void>
}) {
  const [code, setCode] = useState(phase?.code ?? '')
  const [titleEn, setTitleEn] = useState(phase?.title_en ?? '')
  const [titleAm, setTitleAm] = useState(phase?.title_am ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const values = { code: code.trim(), title_en: titleEn, title_am: titleAm }
    const { error } = phase
      ? await db.from('phases').update(values).eq('id', phase.id)
      : await db.from('phases').insert({
          ...values,
          church_id: profile.church_id,
          ministry_id: profile.ministry_id,
        })

    setBusy(false)
    if (error) {
      setError(error.code === '23505' ? `Phase ${code} already exists.` : error.message)
      return
    }
    await onDone()
  }

  return (
    <form className="card stack" style={{ marginBottom: '1rem' }} onSubmit={submit}>
      <strong>{phase ? `Edit phase ${phase.code}` : 'New phase'}</strong>
      <div className="row" style={{ alignItems: 'end', gap: '1rem' }}>
        <label style={{ maxWidth: '7rem' }}>
          Code
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <div className="bilingual" style={{ flex: 1 }}>
          <label>
            Title (English)
            <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          </label>
          <label>
            ርዕስ (አማርኛ)
            <input lang="am" value={titleAm} onChange={(e) => setTitleAm(e.target.value)} />
          </label>
        </div>
      </div>
      {error && <p className="problem">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : phase ? 'Save phase' : 'Create phase'}
        </button>
        {phase && (
          <span className="muted" style={{ fontSize: '.8rem' }}>
            Renaming the code updates every round in this phase.
          </span>
        )}
      </div>
    </form>
  )
}

function RoundForm({
  profile, phaseId, round, nextCode, lastScheduled, takenColours = [], onDone,
}: {
  profile: AdminProfile
  phaseId: string
  round?: RoundRow
  nextCode: string
  lastScheduled: string | null
  /** Colours already in use, so a new round does not silently match an existing one. */
  takenColours?: string[]
  onDone: () => Promise<void>
}) {
  const [code, setCode] = useState(round?.round_code ?? nextCode)
  // Rounds run back to back: the obvious start is the day after the last
  // scheduled devotion, and starting earlier would collide with it anyway, since
  // only one day may occupy a date.
  const suggested = dayAfter(lastScheduled)
  const [startsOn, setStartsOn] = useState(
    round?.starts_on ?? suggested ?? new Date().toISOString().slice(0, 10),
  )
  const [verseEn, setVerseEn] = useState(round?.main_verse_en ?? '')
  const [verseAm, setVerseAm] = useState(round?.main_verse_am ?? '')
  const [colour, setColour] = useState<RoundColour>(
    (round?.colour as RoundColour | undefined) ?? suggestColour(takenColours),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const values = {
      round_code: code.trim(),
      main_verse_en: verseEn,
      main_verse_am: verseAm,
      starts_on: startsOn,
      colour,
    }
    const { error } = round
      ? await db.from('rounds').update(values).eq('id', round.id)
      : await db.from('rounds').insert({
          ...values,
          church_id: profile.church_id,
          ministry_id: profile.ministry_id,
          phase_id: phaseId,
          status: 'draft',
        })

    setBusy(false)
    if (error) {
      setError(error.code === '23505' ? `Round ${code} already exists here.` : error.message)
      return
    }
    await onDone()
  }

  return (
    <form
      className="card stack"
      style={{ marginBottom: '.8rem', background: 'var(--surface-2)' }}
      onSubmit={submit}
    >
      <strong style={{ fontSize: '.9rem' }}>{round ? 'Edit round' : 'New round'}</strong>
      <div className="row" style={{ alignItems: 'end', gap: '1rem' }}>
        <label style={{ maxWidth: '7rem' }}>
          Round code
          <input value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        <label style={{ maxWidth: '11rem' }}>
          First day
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
        </label>
        <span className="muted" style={{ fontSize: '.82rem' }}>
          {formatEthiopic(startsOn, 'en')}
          {!round && suggested && (
            <div className="faint" style={{ fontSize: '.75rem' }}>
              {startsOn === suggested
                ? `The day after the current round ends (${lastScheduled}).`
                : `The current round runs to ${lastScheduled}.`}
            </div>
          )}
        </span>
      </div>
      {/*
        The colour is only ever seen on the schedule calendar, so the label says so
        — otherwise it reads as branding and gets picked at random.
      */}
      <div>
        <label style={{ marginBottom: 6 }}>Colour on the calendar</label>
        <div className="swatches">
          {ROUND_COLOURS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`swatch${colour === c.key ? ' is-on' : ''}`}
              style={{ background: c.hex }}
              onClick={() => setColour(c.key)}
              aria-pressed={colour === c.key}
              aria-label={c.label}
              title={takenColours.includes(c.key) && c.key !== round?.colour ? `${c.label} — already used by another round` : c.label}
            >
              {takenColours.includes(c.key) && c.key !== round?.colour && <i className="taken" />}
            </button>
          ))}
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
          {busy ? 'Saving…' : round ? 'Save round' : 'Create round'}
        </button>
      </div>
    </form>
  )
}

function BookForm({
  profile, roundId, nextSequence, onDone,
}: {
  profile: AdminProfile
  roundId: string
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
      round_id: roundId,
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
      style={{ marginBottom: '.8rem', background: 'var(--surface-2)' }}
      onSubmit={submit}
    >
      <strong style={{ fontSize: '.9rem' }}>New book</strong>
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
        <span className="muted" style={{ fontSize: '.8rem' }}>
          Days are added inside the book.
        </span>
      </div>
    </form>
  )
}
