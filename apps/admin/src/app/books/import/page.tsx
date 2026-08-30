'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  prepareBundle, scheduleDays, type ContentIssue, type PreparedBook, type SourceBundle,
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
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const commit = async () => {
    if (!preview || !profile) return
    setCommitting(true)
    setError(null)

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
            // deliberate act — that is the whole point of the review flow.
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
          'Review them, then publish from Content.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }

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
            ← All content
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
      {result && <p style={{ color: 'var(--ok)' }}>{result}</p>}

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
            References needing a decision ({preview.issues.length})
          </h3>
          {preview.issues.length === 0 ? (
            <p className="muted">Every reference parsed and validated cleanly.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Day</th>
                  <th>Field</th>
                  <th>As written</th>
                  <th>Problem</th>
                  <th>Suggested</th>
                </tr>
              </thead>
              <tbody>
                {preview.issues.map((issue, i) => (
                  <tr key={i}>
                    <td className="muted">{issue.book}</td>
                    <td className="muted">{issue.day}</td>
                    <td className="muted">{issue.field}</td>
                    <td className="mono" lang="am">{issue.raw}</td>
                    <td className="problem">{issue.message}</td>
                    <td className="mono">{issue.suggestion ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted">
            Nothing here is corrected automatically. References import exactly as the
            ministry wrote them, and these are the ones worth a second look.
          </p>

          <button className="primary" onClick={() => void commit()} disabled={committing}>
            {committing ? 'Importing…' : 'Commit import'}
          </button>
        </>
      )}
    </>
  )
}
