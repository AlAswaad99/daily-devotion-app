'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  normalise, prepareBundle, scheduleDays, type ContentIssue, type PreparedBook, type SourceBundle,
} from '@abide/content'
import { formatEthiopic } from '@abide/domain'
import { db, recordRevision } from '../../../lib/db'
import { useSession } from '../../../lib/session'
import { RequireAdmin } from '../../../components/RequireAdmin'

/**
 * Upload the ministry's JSON, see exactly what it will do, then commit.
 *
 * The parser here is the same package the CLI importer uses — not a re-implementation
 * — so the report shown in this browser is the report the import actually produces.
 * Nothing is written until Commit is pressed.
 */
export default function Import() {
  return (
    <RequireAdmin>
      <ImportInner />
    </RequireAdmin>
  )
}

interface Preview {
  books: PreparedBook[]
  issues: ContentIssue[]
  schedule: Map<string, string>
  startsOn: string
}

interface ArchivedCollision {
  round: { id: string; round_code: string; phase_code: string }
  bookCount: number
  dayCount: number
  firstDate: string | null
  lastDate: string | null
}

type EditableField = 'verses' | 'key_verses' | 'cross_references'

/** One row of the correction table: every issue that shares the same field. */
interface IssueGroup {
  key: string
  book: string
  day: number
  field: ContentIssue['field']
  raw: string
  problems: ContentIssue[]
}

function groupIssues(issues: ContentIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>()
  for (const issue of issues) {
    const key = `${issue.book}#${issue.day}#${issue.field}`
    const existing = groups.get(key)
    if (existing) {
      existing.problems.push(issue)
      // `raw` reflects the field as it stands now, which may have changed since
      // an earlier problem in this group was recorded.
      existing.raw = issue.raw
    } else {
      groups.set(key, {
        key, book: issue.book, day: issue.day, field: issue.field, raw: issue.raw, problems: [issue],
      })
    }
  }
  return [...groups.values()]
}

export function ImportInner() {
  const { profile } = useSession()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [bundles, setBundles] = useState<SourceBundle[]>([])
  // Left empty for the first render rather than computed from `new Date()`: this
  // page is prerendered, so a date produced during render is the *build* date, and
  // would also differ between server and client HTML.
  const [startsOn, setStartsOn] = useState('')
  const [lastScheduled, setLastScheduled] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [collision, setCollision] = useState<ArchivedCollision | null>(null)
  const [collisionChoice, setCollisionChoice] = useState<'revive' | 'skip' | null>(null)

  // Rounds run back to back, so an import starts the day after the last scheduled
  // devotion. Falls back to today when there is nothing scheduled yet.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await db
        .from('devotion_days')
        .select('scheduled_date')
        .not('scheduled_date', 'is', null)
        .order('scheduled_date', { ascending: false })
        .limit(1)

      const last = (data as Array<{ scheduled_date: string }> | null)?.[0]?.scheduled_date
      const next = new Date(last ? `${last}T00:00:00Z` : Date.now())
      if (last) next.setUTCDate(next.getUTCDate() + 1)

      if (!cancelled) {
        setLastScheduled(last ?? null)
        setStartsOn(next.toISOString().slice(0, 10))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const analyse = (parsed: SourceBundle[], start: string) => {
    const books: PreparedBook[] = []
    const issues: ContentIssue[] = []
    let sequence = 0
    for (const bundle of parsed) {
      const prepared = prepareBundle(bundle, sequence)
      sequence += prepared.books.length
      books.push(...prepared.books)
      issues.push(...prepared.issues)
    }
    setPreview({ books, issues, schedule: scheduleDays(books, start), startsOn: start })
  }

  // A round whose phase/round code matches something already archived would
  // otherwise be silently revived by the upsert below — check for that the moment
  // a file names its round, so the choice is made before Commit rather than
  // discovered after.
  const checkCollision = async (parsed: SourceBundle[]) => {
    if (!parsed.length || !profile) {
      setCollision(null)
      setCollisionChoice(null)
      return
    }
    const metadata = parsed[0]!.devotional_metadata
    const { data: round } = await db
      .from('rounds')
      .select('id, round_code, phase_code, status')
      .eq('ministry_id', profile.ministry_id)
      .eq('phase_code', metadata.phase)
      .eq('round_code', metadata.round)
      .maybeSingle()

    const archived = round as { id: string; round_code: string; phase_code: string; status: string } | null
    if (!archived || archived.status !== 'archived') {
      setCollision(null)
      setCollisionChoice(null)
      return
    }

    const { data: books } = await db.from('books').select('id').eq('round_id', archived.id)
    const bookIds = ((books as Array<{ id: string }> | null) ?? []).map((b) => b.id)
    const { data: days } = bookIds.length
      ? await db.from('devotion_days').select('scheduled_date').in('book_id', bookIds)
      : { data: [] }
    const dates = ((days as Array<{ scheduled_date: string | null }> | null) ?? [])
      .map((d) => d.scheduled_date)
      .filter((d): d is string => Boolean(d))
      .sort()

    setCollision({
      round: archived,
      bookCount: bookIds.length,
      dayCount: (days as unknown[] | null)?.length ?? 0,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    })
    setCollisionChoice(null)
  }

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    setResult(null)
    try {
      const parsed: SourceBundle[] = []
      for (const file of Array.from(files)) {
        parsed.push(JSON.parse(await file.text()) as SourceBundle)
      }
      setBundles(parsed)
      analyse(parsed, startsOn)
      await checkCollision(parsed)
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Splice a corrected field back into the uploaded JSON and re-run the parser on it. */
  const editField = (book: string, day: number, field: EditableField, value: string) => {
    const next = bundles.map((bundle) => ({
      ...bundle,
      books: bundle.books.map((b) =>
        b.book_id !== book
          ? b
          : {
              ...b,
              daily_devotions: b.daily_devotions.map((d) =>
                d.day !== day ? d : { ...d, [field]: value },
              ),
            },
      ),
    }))
    setBundles(next)
    analyse(next, startsOn)
  }

  const commit = async () => {
    if (!preview || !profile) return
    setCommitting(true)
    setError(null)

    if (collision && collisionChoice === 'skip') {
      setCommitting(false)
      setResult(
        `Skipped — round ${collision.round.phase_code}/${collision.round.round_code} is ` +
          'still archived, and nothing was written.',
      )
      return
    }

    try {
      const metadata = bundles[0]!.devotional_metadata

      // Everything is written as the signed-in admin under RLS. There is no
      // service-role key in this app.
      const { data: round, error: roundError } = await db
        .from('rounds')
        .upsert(
          {
            church_id: profile.church_id,
            ministry_id: profile.ministry_id,
            phase_code: metadata.phase,
            round_code: metadata.round,
            main_verse_en: metadata.main_verse.en,
            main_verse_am: metadata.main_verse.am,
            starts_on: preview.startsOn,
            // Imported content lands as a draft. Publishing is a separate,
            // deliberate act — that is the whole point of the review flow. A
            // round revived from Archived also lands here, as a draft.
            status: 'draft',
          },
          { onConflict: 'ministry_id,phase_code,round_code' },
        )
        .select('id')
        .single()
      if (roundError) throw roundError

      let dayCount = 0
      for (const book of preview.books) {
        const { data: bookRow, error: bookError } = await db
          .from('books')
          .upsert(
            {
              church_id: profile.church_id,
              round_id: (round as { id: string }).id,
              sequence: book.sequence,
              source_id: book.sourceId,
              title_en: book.titleEn,
              title_am: book.titleAm,
              status: 'draft',
            },
            { onConflict: 'round_id,sequence' },
          )
          .select('id')
          .single()
        if (bookError) throw bookError
        const bookId = (bookRow as { id: string }).id

        const { error: dayError } = await db.from('devotion_days').upsert(
          book.days.map((d) => ({
            church_id: profile.church_id,
            book_id: bookId,
            day_number: d.dayNumber,
            kind: d.kind,
            topic_en: d.topicEn,
            topic_am: d.topicAm,
            purpose_en: d.purposeEn,
            purpose_am: d.purposeAm,
            prayer_en: d.prayerEn,
            prayer_am: d.prayerAm,
            passage: d.passage,
            key_verses: d.keyVerses,
            cross_refs: d.crossRefs,
            passage_raw: d.passageRaw,
            key_verses_raw: d.keyVersesRaw,
            cross_refs_raw: d.crossRefsRaw,
            expected_seconds: d.expectedSeconds,
            scheduled_date: preview.schedule.get(`${book.sourceId}#${d.dayNumber}`) ?? null,
            status: 'draft',
          })),
          { onConflict: 'book_id,day_number' },
        )
        if (dayError) throw dayError
        dayCount += book.days.length

        if (book.summaryQuestions.length) {
          const { error: qError } = await db.from('summary_questions').upsert(
            book.summaryQuestions.map((q) => ({
              church_id: profile.church_id,
              book_id: bookId,
              ordinal: q.ordinal,
              question_en: q.questionEn,
              question_am: q.questionAm,
            })),
            { onConflict: 'book_id,ordinal' },
          )
          if (qError) throw qError
        }

        await recordRevision({
          churchId: profile.church_id,
          entityType: 'book',
          entityId: bookId,
          status: 'draft',
          authorId: profile.id,
          payload: { imported: book.sourceId, days: book.days.length },
        })
      }

      setResult(
        `Imported ${preview.books.length} book(s) and ${dayCount} days as drafts. ` +
          (collisionChoice === 'revive'
            ? 'The archived round was revived in place. '
            : '') +
          'Review them, then publish from Content.',
      )
      setCollision(null)
      setCollisionChoice(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }

  const issueGroups = preview ? groupIssues(preview.issues) : []
  const commitBlocked = collision !== null && collisionChoice === null

  return (
    <>
      <div className="page-head">
        <div className="spread">
          <div>
            <h2>Import a round</h2>
            <p className="sub">
              One way of creating content, not a separate place for it. Nothing is
              written until you commit, and what is written arrives as a draft.
            </p>
          </div>
          <Link href="/books" className="button">
            ← Library
          </Link>
        </div>
      </div>

      <div className="card stack">
        <label>
          Ministry JSON (one or more files)
          <input type="file" accept="application/json" multiple onChange={(e) => void onFiles(e.target.files)} />
        </label>
        <label>
          First day of the round
          <input
            type="date"
            value={startsOn}
            onChange={(e) => {
              setStartsOn(e.target.value)
              if (bundles.length) analyse(bundles, e.target.value)
            }}
          />
        </label>
        {startsOn && (
          <p className="muted" style={{ margin: 0 }}>
            {formatEthiopic(startsOn, 'en')} in the Ethiopian calendar
            {lastScheduled && (
              <span className="faint">
                {' · '}
                the current round runs to {lastScheduled}
              </span>
            )}
          </p>
        )}
      </div>

      {error && <p className="problem">{error}</p>}
      {result && <p style={{ color: 'var(--good)' }}>{result}</p>}

      {collision && (
        <div className="card stack" style={{ borderColor: 'var(--warn-line)', background: 'var(--warn-tint)' }}>
          <strong>This matches an archived round</strong>
          <p className="muted" style={{ margin: 0 }}>
            Phase {collision.round.phase_code} round {collision.round.round_code} is currently
            archived ({collision.bookCount} book{collision.bookCount === 1 ? '' : 's'},{' '}
            {collision.dayCount} day{collision.dayCount === 1 ? '' : 's'}
            {collision.firstDate && `, ${collision.firstDate} – ${collision.lastDate}`}). Choose
            what this import does with it before committing.
          </p>
          <div className="row">
            <button
              type="button"
              className={collisionChoice === 'revive' ? 'primary' : ''}
              onClick={() => setCollisionChoice('revive')}
            >
              Revive in place
            </button>
            <button
              type="button"
              className={collisionChoice === 'skip' ? 'primary' : ''}
              onClick={() => setCollisionChoice('skip')}
            >
              Skip this round
            </button>
          </div>
          {collisionChoice === 'revive' && (
            <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
              The archived round and its books are overwritten with this content and return as
              a draft. The “(Archived)” marker is removed from every title.
            </p>
          )}
          {collisionChoice === 'skip' && (
            <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
              Nothing will be written. The archived round is left exactly as it is.
            </p>
          )}
        </div>
      )}

      {preview && (
        <>
          <h3 style={{ marginTop: '2rem' }}>What this will do</h3>
          <table>
            <thead>
              <tr>
                <th>Book</th>
                <th>Days</th>
                <th>First</th>
                <th>Last</th>
              </tr>
            </thead>
            <tbody>
              {preview.books.map((book) => {
                const first = preview.schedule.get(`${book.sourceId}#${book.days[0]!.dayNumber}`)
                const last = preview.schedule.get(
                  `${book.sourceId}#${book.days[book.days.length - 1]!.dayNumber}`,
                )
                return (
                  <tr key={book.sourceId}>
                    <td>
                      {book.titleEn}
                      <div className="muted" lang="am" style={{ fontSize: '.85rem' }}>
                        {book.titleAm}
                      </div>
                    </td>
                    <td>
                      {book.days.length}
                      <div className="muted" style={{ fontSize: '.8rem' }}>
                        includes 1 summary day
                      </div>
                    </td>
                    <td className="mono">{first}</td>
                    <td className="mono">{last}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h3 style={{ marginTop: '1.5rem' }}>
            References needing a decision ({issueGroups.reduce((n, g) => n + g.problems.length, 0)})
          </h3>
          {issueGroups.length === 0 ? (
            <p className="muted">Every reference parsed and validated cleanly.</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Day</th>
                    <th>Field</th>
                    <th style={{ width: '18rem' }}>As written</th>
                    <th>Problems</th>
                  </tr>
                </thead>
                <tbody>
                  {issueGroups.map((g) => (
                    <tr key={g.key}>
                      <td className="muted">{g.book}</td>
                      <td className="muted">{g.day}</td>
                      <td className="muted">{g.field}</td>
                      <td>
                        {g.field === 'topic' ? (
                          <span className="mono" lang="am">
                            {g.raw}
                          </span>
                        ) : (
                          <input
                            className="mono"
                            lang="am"
                            value={g.raw}
                            onChange={(e) =>
                              editField(g.book, g.day, g.field as EditableField, e.target.value)
                            }
                          />
                        )}
                      </td>
                      <td>
                        {g.problems.map((p, i) => (
                          <div
                            key={i}
                            className="problem"
                            style={{ fontSize: '.78rem', marginBottom: i < g.problems.length - 1 ? 4 : 0 }}
                          >
                            {p.message}
                            {p.suggestion && p.token && g.field !== 'topic' && (
                              <button
                                className="small"
                                type="button"
                                style={{ marginLeft: 6 }}
                                onClick={() =>
                                  editField(
                                    g.book, g.day, g.field as EditableField,
                                    // `p.token` is a substring of the *normalised* text
                                    // (Ethiopic colons already turned to ASCII, etc.),
                                    // not of `g.raw` itself — replace on the same basis.
                                    normalise(g.raw).replace(p.token, p.suggestion!),
                                  )
                                }
                              >
                                Apply “{p.suggestion}”
                              </button>
                            )}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                Edit a field directly, or apply a suggestion — the report above re-checks as you
                go. Nothing here is corrected automatically until you do.
              </p>
            </>
          )}

          <button className="primary" onClick={() => void commit()} disabled={committing || commitBlocked}>
            {committing
              ? 'Importing…'
              : collisionChoice === 'skip'
                ? 'Skip round'
                : 'Commit import'}
          </button>
        </>
      )}
    </>
  )
}
