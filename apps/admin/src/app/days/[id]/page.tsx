'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatRef, parseReferences, validateRef, STUDY_BOOKS } from '@abide/content'
import { computeExpectedSeconds, formatEthiopic, type ScriptureRef } from '@abide/domain'
import { db, recordRevision, type ContentStatus } from '../../../lib/db'
import { useSession } from '../../../lib/session'
import { RequireAdmin } from '../../../components/RequireAdmin'

interface DayRecord {
  id: string
  book_id: string
  church_id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  topic_am: string
  purpose_en: string
  purpose_am: string
  prayer_en: string
  prayer_am: string
  passage: ScriptureRef | null
  key_verses: ScriptureRef[]
  cross_refs: ScriptureRef[]
  expected_seconds: number
  expected_seconds_overridden: boolean
  scheduled_date: string | null
  status: ContentStatus
}

export default function DayEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RequireAdmin>
      <DayEditorInner dayId={id} />
    </RequireAdmin>
  )
}

function DayEditorInner({ dayId }: { dayId: string }) {
  const { profile } = useSession()
  const router = useRouter()

  const [day, setDay] = useState<DayRecord | null>(null)
  const [draft, setDraft] = useState<Partial<DayRecord>>({})
  const [refs, setRefs] = useState({ passage: '', key: '', cross: '' })
  const [canonicalBook, setCanonicalBook] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    const { data } = await db.from('devotion_days').select('*').eq('id', dayId).maybeSingle()
    const row = data as DayRecord | null
    if (!row) return null

    // Bare references inherit the study's own book, so the editor needs to know it.
    const { data: book } = await db
      .from('books')
      .select('source_id')
      .eq('id', row.book_id)
      .maybeSingle()
    const sourceId = (book as { source_id: string } | null)?.source_id

    return {
      row,
      refs: {
        passage: row.passage?.raw ?? '',
        key: (row.key_verses ?? []).map((r) => r.raw).join(' ፤ '),
        cross: (row.cross_refs ?? []).map((r) => r.raw).join(' ፤ '),
      },
      canonicalBook: (sourceId && STUDY_BOOKS[sourceId]) || 1,
    }
  }, [dayId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const loaded = await load()
      if (cancelled || !loaded) return
      setDay(loaded.row)
      setDraft(loaded.row)
      setRefs(loaded.refs)
      setCanonicalBook(loaded.canonicalBook)
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  /**
   * References validate live, against the same parser and verse index the importer
   * uses. An editor who mistypes a chapter finds out here rather than after a
   * reader taps a dead cross-reference.
   */
  const checked = useMemo(() => {
    const check = (raw: string, chapter?: number) => {
      const parsed = parseReferences(raw, {
        defaultBook: canonicalBook,
        ...(chapter !== undefined ? { defaultChapter: chapter } : {}),
      })
      const problems = [
        ...parsed.issues.map((i) => `${i.token}: ${i.message}`),
        ...parsed.refs.flatMap((r) => validateRef(r).map((v) => v.message)),
      ]
      return { refs: parsed.refs, problems }
    }

    const passage = check(refs.passage)
    const chapter = passage.refs[0]?.chapter
    return { passage, key: check(refs.key, chapter), cross: check(refs.cross, chapter) }
  }, [refs, canonicalBook])

  const set = (field: keyof DayRecord, value: string) =>
    setDraft((d) => ({ ...d, [field]: value }))

  const save = async () => {
    if (!day || !profile) return
    setSaving(true)

    // Recomputed from the English text unless an admin has pinned it by hand.
    const expected = day.expected_seconds_overridden
      ? day.expected_seconds
      : computeExpectedSeconds(
          [draft.topic_en ?? '', draft.purpose_en ?? '', draft.prayer_en ?? ''].join(' '),
        )

    const { error } = await db
      .from('devotion_days')
      .update({
        topic_en: draft.topic_en ?? '',
        topic_am: draft.topic_am ?? '',
        purpose_en: draft.purpose_en ?? '',
        purpose_am: draft.purpose_am ?? '',
        prayer_en: draft.prayer_en ?? '',
        prayer_am: draft.prayer_am ?? '',
        passage: checked.passage.refs[0] ?? null,
        key_verses: checked.key.refs,
        cross_refs: checked.cross.refs,
        expected_seconds: expected,
      })
      .eq('id', day.id)

    setSaving(false)
    if (!error) {
      setSaved(true)
      await recordRevision({
        churchId: day.church_id,
        entityType: 'devotion_day',
        entityId: day.id,
        status: day.status,
        authorId: profile.id,
        payload: { day_number: day.day_number, topic_en: draft.topic_en },
      })
      // An edit to a published day propagates silently, by decision — the review
      // flow is what makes meaning-changes unlikely.
      setTimeout(() => setSaved(false), 2500)
    }
  }

  if (!day) return <p className="muted">Loading…</p>

  return (
    <>
      <div className="spread">
        <div>
          <h2>
            Day {day.day_number}
            {day.kind === 'summary' && ' · summary'}
          </h2>
          <p className="sub">
            {day.scheduled_date
              ? `${formatEthiopic(day.scheduled_date, 'en')} · ${day.scheduled_date}`
              : 'Not scheduled yet'}
            {' · '}
            <span className={`pill ${day.status}`}>{day.status}</span>
          </p>
        </div>
        <button onClick={() => router.push(`/books/${day.book_id}`)}>Back to book</button>
      </div>

      <div className="stack">
        <Field
          label="Topic"
          en={draft.topic_en ?? ''}
          am={draft.topic_am ?? ''}
          onEn={(v) => set('topic_en', v)}
          onAm={(v) => set('topic_am', v)}
        />
        <Field
          label="Purpose"
          multiline
          en={draft.purpose_en ?? ''}
          am={draft.purpose_am ?? ''}
          onEn={(v) => set('purpose_en', v)}
          onAm={(v) => set('purpose_am', v)}
        />
        <Field
          label="Prayer"
          multiline
          en={draft.prayer_en ?? ''}
          am={draft.prayer_am ?? ''}
          onEn={(v) => set('prayer_en', v)}
          onAm={(v) => set('prayer_am', v)}
        />

        <RefField
          label="Passage"
          value={refs.passage}
          onChange={(v) => setRefs((r) => ({ ...r, passage: v }))}
          result={checked.passage}
        />
        <RefField
          label="Key verses"
          value={refs.key}
          onChange={(v) => setRefs((r) => ({ ...r, key: v }))}
          result={checked.key}
        />
        <RefField
          label="Cross references"
          value={refs.cross}
          onChange={(v) => setRefs((r) => ({ ...r, cross: v }))}
          result={checked.cross}
        />

        <div className="row">
          <button className="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {saved && <span className="muted">Saved</span>}
        </div>
      </div>
    </>
  )
}

/** English and Amharic adjacent, so a translator can see both at once. */
function Field({
  label, en, am, onEn, onAm, multiline,
}: {
  label: string
  en: string
  am: string
  onEn: (v: string) => void
  onAm: (v: string) => void
  multiline?: boolean
}) {
  const Input = multiline ? 'textarea' : 'input'
  const missing = !en.trim() || !am.trim()

  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: '.5rem' }}>
        <strong>{label}</strong>
        {missing && <span className="problem" style={{ fontSize: '.8rem' }}>Incomplete</span>}
      </div>
      <div className="bilingual">
        <label>
          English
          <Input value={en} onChange={(e) => onEn(e.target.value)} />
        </label>
        <label>
          አማርኛ
          <Input lang="am" value={am} onChange={(e) => onAm(e.target.value)} />
        </label>
      </div>
    </div>
  )
}

function RefField({
  label, value, onChange, result,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  result: { refs: ScriptureRef[]; problems: string[] }
}) {
  return (
    <div className="card">
      <div className="spread" style={{ marginBottom: '.5rem' }}>
        <strong>{label}</strong>
        <span className="muted" style={{ fontSize: '.78rem' }}>
          As the ministry writes it — Ethiopic or ASCII separators both work
        </span>
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} />

      {result.refs.length > 0 && (
        <p className="muted" style={{ marginBottom: 0 }}>
          Reads as: {result.refs.map((r) => formatRef(r, 'en')).join(' · ')}
        </p>
      )}
      {result.problems.map((problem, i) => (
        <p key={i} className="problem" style={{ margin: '.25rem 0 0' }}>
          {problem}
        </p>
      ))}
    </div>
  )
}
