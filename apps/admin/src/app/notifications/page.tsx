'use client'

import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { useSession, type AdminProfile } from '../../lib/session'
import { RequireAdmin } from '../../components/RequireAdmin'

interface Template {
  id: string
  kind: string
  enabled: boolean
  title_en: string
  title_am: string
  body_en: string
  body_am: string
  variants: Array<Record<string, string>>
}

interface OptOut {
  kind: string
  enabled_globally: boolean
  opted_out: number
  members: number
}

/** Ordered as the ladder is experienced, not alphabetically. */
const LADDER: Array<{ kind: string; when: string }> = [
  { kind: 'daily_reminder', when: 'At the time each member chose, if today is unread' },
  { kind: 'streak_at_risk', when: '21:00, streak of 3 or more, today still unread' },
  { kind: 'streak_lost', when: 'The morning after a streak breaks' },
  { kind: 'repair_available', when: '19:00, when a missed day can still be repaired' },
  { kind: 'comeback_d3', when: 'Three days without reading' },
  { kind: 'comeback_d7', when: 'Seven days without reading' },
  { kind: 'comeback_d14', when: 'Fourteen days without reading' },
  { kind: 'milestone', when: 'A streak reaches 7, 14, 30, 50 or 100' },
  { kind: 'book_complete', when: 'The final day of a book is completed' },
  { kind: 'round_start', when: 'A new round begins' },
  { kind: 'broadcast', when: 'Sent by an admin — exempt from the daily cap' },
]

async function fetchNotifications() {
  const [{ data: t }, { data: o }] = await Promise.all([
    db.from('notification_templates').select('*'),
    db.rpc('notification_optouts'),
  ])
  return {
    templates: (t as Template[] | null) ?? [],
    optOuts: (o as OptOut[] | null) ?? [],
  }
}

export default function Notifications() {
  return (
    <RequireAdmin>
      <NotificationsInner />
    </RequireAdmin>
  )
}

function NotificationsInner() {
  const { profile } = useSession()
  const [templates, setTemplates] = useState<Template[]>([])
  const [optOuts, setOptOuts] = useState<OptOut[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  // Handed to the composer when a rung's "Use" is pressed. The nonce makes
  // pressing the same rung twice count as a new request.
  const [prefill, setPrefill] = useState<(Template & { nonce: number }) | null>(null)
  // Bumped when a broadcast is scheduled or cancelled, so the list below reflects
  // what was just done rather than what was true when the page loaded.
  const [scheduledVersion, setScheduledVersion] = useState(0)

  const refresh = useCallback(async () => {
    const data = await fetchNotifications()
    setTemplates(data.templates)
    setOptOuts(data.optOuts)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await fetchNotifications()
      if (!cancelled) {
        setTemplates(data.templates)
        setOptOuts(data.optOuts)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = async (template: Template) => {
    await db
      .from('notification_templates')
      .update({ enabled: !template.enabled })
      .eq('id', template.id)
    await refresh()
  }

  const byKind = new Map(templates.map((t) => [t.kind, t]))
  const optOutByKind = new Map(optOuts.map((o) => [o.kind, o]))
  const editingTemplate = templates.find((t) => t.id === editing)

  return (
    <>
      <div className="page-head">
        <h2>Notifications</h2>
        <p className="sub">
          Every rung is admin-configurable and member-disableable, and the copy is
          content rather than code. At most <strong>two</strong> non-broadcast
          notifications reach anyone in a day, chosen by priority — that cap is what
          makes the whole ladder safe to leave on.
        </p>
      </div>

      {profile && (
        <Broadcast
          profile={profile}
          prefill={prefill}
          onScheduled={() => setScheduledVersion((v) => v + 1)}
        />
      )}
      <Scheduled version={scheduledVersion} />

      <h3 style={{ marginTop: '1.5rem' }}>The ladder</h3>
      <table>
        <thead>
          <tr>
            <th style={{ width: '11rem' }}>Kind</th>
            <th>Fires</th>
            <th style={{ width: '12rem' }}>Muted by members</th>
            <th style={{ width: '11rem' }} />
          </tr>
        </thead>
        <tbody>
          {LADDER.map((rung) => {
            const template = byKind.get(rung.kind)
            const stats = optOutByKind.get(rung.kind)
            const muted = Number(stats?.opted_out ?? 0)
            const members = Number(stats?.members ?? 0)
            return (
              <tr key={rung.kind}>
                <td>
                  <strong style={{ fontSize: '.85rem' }}>{rung.kind}</strong>
                  {template && !template.enabled && (
                    <div className="faint" style={{ fontSize: '.72rem' }}>
                      off for everyone
                    </div>
                  )}
                </td>
                <td className="muted" style={{ fontSize: '.82rem' }}>
                  {rung.when}
                </td>
                <td>
                  {/*
                    The feedback loop the spec asks for: an admin who cannot see that
                    members are muting a kind will keep sending it.
                  */}
                  {members > 0 ? (
                    <>
                      <span className={muted / members > 0.3 ? 'problem' : 'muted'}>
                        {muted} of {members}
                      </span>
                      <div className="bar-track" style={{ marginTop: 3 }}>
                        <div
                          className="bar-fill"
                          style={{ width: `${(muted / members) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    {template && (
                      <>
                        {/*
                          Sends this rung's wording as a broadcast so it can be seen
                          on a real phone. It does not simulate the trigger — the
                          point is to look at the words, not to fake a streak.
                        */}
                        {rung.kind !== 'broadcast' && (
                          <button
                            className="small"
                            title="Load this wording into the composer above"
                            onClick={() => {
                              setPrefill({ ...template, nonce: Date.now() })
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                          >
                            Use
                          </button>
                        )}
                        <button className="small" onClick={() => void toggle(template)}>
                          {template.enabled ? 'Turn off' : 'Turn on'}
                        </button>
                        <button
                          className="small"
                          onClick={() =>
                            setEditing(editing === template.id ? null : template.id)
                          }
                        >
                          {editing === template.id ? 'Cancel' : 'Edit wording'}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {editingTemplate && (
        <TemplateForm
          template={editingTemplate}
          onDone={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      )}
    </>
  )
}

function TemplateForm({ template, onDone }: { template: Template; onDone: () => Promise<void> }) {
  const [titleEn, setTitleEn] = useState(template.title_en)
  const [titleAm, setTitleAm] = useState(template.title_am)
  const [bodyEn, setBodyEn] = useState(template.body_en)
  const [bodyAm, setBodyAm] = useState(template.body_am)
  const [busy, setBusy] = useState(false)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    await db
      .from('notification_templates')
      .update({ title_en: titleEn, title_am: titleAm, body_en: bodyEn, body_am: bodyAm })
      .eq('id', template.id)
    setBusy(false)
    await onDone()
  }

  return (
    <form className="card stack" style={{ marginTop: '1rem' }} onSubmit={save}>
      <div className="spread">
        <strong>{template.kind}</strong>
        <span className="faint" style={{ fontSize: '.75rem' }}>
          {template.variants?.length ?? 0} extra variant(s) rotate with this copy
        </span>
      </div>
      <div className="bilingual">
        <label>
          Title (English)
          <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        </label>
        <label>
          ርዕስ (አማርኛ)
          <input lang="am" value={titleAm} onChange={(e) => setTitleAm(e.target.value)} />
        </label>
      </div>
      <div className="bilingual">
        <label>
          Body (English)
          <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} />
        </label>
        <label>
          ጽሑፍ (አማርኛ)
          <textarea lang="am" value={bodyAm} onChange={(e) => setBodyAm(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save copy'}
        </button>
        <span className="muted" style={{ fontSize: '.8rem' }}>
          The token {'{streak}'} is replaced with the member&rsquo;s streak where it appears.
        </span>
      </div>
    </form>
  )
}

/*
 * The ministry runs on East Africa Time, and so does scheduling — an admin who
 * travels should not shift when the youth group hears from them.
 *
 * `datetime-local` has no timezone, and both `new Date(value)` and
 * `toLocaleString()` would silently use the browser's. EAT is UTC+3 with no daylight
 * saving, so the conversion is a fixed offset rather than a library.
 */
const EAT_OFFSET_MINUTES = 3 * 60

/** "2026-08-31T20:00" entered as EAT wall-clock -> the UTC instant it names. */
function eatToInstant(local: string): Date {
  const [date, time] = local.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - EAT_OFFSET_MINUTES * 60_000)
}

/** The reverse, for display: an instant shown as EAT wall-clock. */
function instantToEat(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + EAT_OFFSET_MINUTES * 60_000)
  return shifted.toISOString().slice(0, 16).replace('T', ' ')
}

/** The values a message can carry, and what each one costs if it is missing. */
const VARIABLES: Array<{ token: string; means: string }> = [
  { token: '{name}', means: 'Their display name — falls back to “friend”, never blank' },
  { token: '{streak}', means: 'Current streak, only when they have one' },
  { token: '{book}', means: 'The book they are reading' },
  { token: '{day}', means: 'Their day number in the round' },
  { token: '{last_read}', means: 'Days since they last read' },
]

interface Summary {
  matched: number
  muted: number
  no_device: number
  skipped_no_copy: number
  already_today: number
}

interface Member {
  id: string
  display_name: string
}

interface SavedTemplate {
  id: string
  name: string
  title_en: string
  title_am: string
  body_en: string
  body_am: string
}

const AUDIENCES: Array<{ value: string; label: string; target: Record<string, unknown> }> = [
  { value: 'everyone', label: 'Everyone in the ministry', target: {} },
  { value: 'active7', label: 'Read something in the last 7 days', target: { active_within_days: 7 } },
  { value: 'slipping', label: 'Streak under 3 — slipping away', target: { streak_below: 3 } },
  { value: 'committed', label: 'Streak of 7 or more', target: { streak_at_least: 7 } },
]

function Broadcast({
  profile, prefill, onScheduled,
}: {
  profile: AdminProfile
  prefill: (Template & { nonce: number }) | null
  onScheduled: () => void
}) {
  const [titleEn, setTitleEn] = useState('')
  const [titleAm, setTitleAm] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [bodyAm, setBodyAm] = useState('')
  const [audience, setAudience] = useState('everyone')
  const [recipient, setRecipient] = useState('')
  const [when, setWhen] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [templates, setTemplates] = useState<SavedTemplate[]>([])
  const [previewOf, setPreviewOf] = useState('')
  const [preview, setPreview] = useState<{ title: string | null; body: string | null; lang: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [borrowedFrom, setBorrowedFrom] = useState<string | null>(null)

  /*
   * A rung's wording, loaded for editing.
   *
   * Adjusted during render rather than in an effect — React's own advice for
   * "state that changes when a prop changes", and it avoids the extra commit an
   * effect would cause. The nonce is what makes pressing the same rung twice
   * count as a fresh request.
   */
  const [loadedNonce, setLoadedNonce] = useState<number | null>(null)
  if (prefill && prefill.nonce !== loadedNonce) {
    setLoadedNonce(prefill.nonce)
    setTitleEn(prefill.title_en)
    setTitleAm(prefill.title_am)
    setBodyEn(prefill.body_en)
    setBodyAm(prefill.body_am)
    setBorrowedFrom(prefill.kind)
    setResult(null)
  }

  // Targeting a single member is just an audience of one, so the rest of the
  // pipeline — rendering, mute, skipping — behaves identically.
  const target = recipient
    ? { recipient_id: recipient }
    : (AUDIENCES.find((a) => a.value === audience)?.target ?? {})
  const targetKey = JSON.stringify(target)

  useEffect(() => {
    void (async () => {
      const [{ data: m }, { data: t }] = await Promise.all([
        db.from('profiles').select('id, display_name').order('display_name'),
        db.from('broadcast_templates').select('*').order('name'),
      ])
      setMembers((m as Member[] | null) ?? [])
      setTemplates((t as SavedTemplate[] | null) ?? [])
    })()
  }, [])

  /*
   * Who this reaches, recomputed as the copy changes — because with variables the
   * copy itself decides who is reachable. A message that is nothing but a
   * {streak} sentence has an audience of only those who have a streak.
   */
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      void (async () => {
        const { data } = await db.rpc('broadcast_audience_summary', {
          p_target: JSON.parse(targetKey),
          p_title_en: titleEn,
          p_title_am: titleAm,
          p_body_en: bodyEn,
          p_body_am: bodyAm,
        })
        if (!cancelled) setSummary((data as Summary[] | null)?.[0] ?? null)
      })()
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [targetKey, titleEn, titleAm, bodyEn, bodyAm])

  const runPreview = async (userId: string) => {
    setPreviewOf(userId)
    if (!userId) return setPreview(null)
    const { data } = await db.rpc('preview_broadcast', {
      p_user: userId,
      p_title_en: titleEn,
      p_title_am: titleAm,
      p_body_en: bodyEn,
      p_body_am: bodyAm,
    })
    const row = (data as Array<{ title: string | null; body: string | null; lang: string }> | null)?.[0]
    setPreview(row ?? null)
  }

  const clear = () => {
    setTitleEn('')
    setTitleAm('')
    setBodyEn('')
    setBodyAm('')
    setBorrowedFrom(null)
    setPreview(null)
    setPreviewOf('')
  }

  const saveTemplate = async () => {
    const name = window.prompt('Name this template')
    if (!name) return
    const { error } = await db.from('broadcast_templates').insert({
      ministry_id: profile.ministry_id,
      name,
      title_en: titleEn,
      title_am: titleAm,
      body_en: bodyEn,
      body_am: bodyAm,
      created_by: profile.id,
    })
    if (error) return setResult(error.message)
    const { data } = await db.from('broadcast_templates').select('*').order('name')
    setTemplates((data as SavedTemplate[] | null) ?? [])
    setResult(`Saved “${name}”.`)
  }

  const reach = summary?.matched ?? null
  const hasCopy = bodyEn.trim() !== '' || bodyAm.trim() !== ''
  const willSkip = (hasCopy ? (summary?.skipped_no_copy ?? 0) : 0) + (summary?.no_device ?? 0)
  const missingAm = !titleAm.trim() || !bodyAm.trim()
  const missingEn = !titleEn.trim() || !bodyEn.trim()

  const send = async (event: React.FormEvent) => {
    event.preventDefault()

    const scheduled = when !== ''
    const verb = scheduled ? `Schedule this for ${when.replace('T', ' ')} EAT` : 'Send this now'

    if (!window.confirm(`${verb} to ${reach ?? 0} member(s)?`)) return

    setBusy(true)
    setResult(null)

    const { data: created, error } = await db
      .from('broadcasts')
      .insert({
        ministry_id: profile.ministry_id,
        title_en: titleEn,
        title_am: titleAm,
        body_en: bodyEn,
        body_am: bodyAm,
        target,
        created_by: profile.id,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error) {
      setBusy(false)
      setResult(error.message)
      return
    }

    const id = (created as { id: string }).id

    if (scheduled) {
      /*
       * Nothing is written per member here. The dispatcher resolves the audience
       * and fills the variables in when it goes out, which is what lets this be
       * edited or cancelled in the meantime — and what stops a Friday message
       * quoting Monday's streak.
       */
      const { error: scheduleError } = await db.rpc('schedule_broadcast', {
        p_broadcast: id,
        p_at: eatToInstant(when).toISOString(),
      })
      setBusy(false)
      setResult(
        scheduleError
          ? scheduleError.message
          : `Scheduled. The audience and everyone's numbers are worked out when it ` +
            'goes out, not now, so this stays editable until then.',
      )
      if (!scheduleError) {
        clear()
        setWhen('')
        onScheduled()
      }
      return
    }

    const { data: sent, error: sendError } = await db.rpc('send_broadcast', { p_broadcast: id })
    setBusy(false)
    setResult(
      sendError
        ? sendError.message
        : `Sent to ${sent} member(s). Delivery runs every five minutes, so it arrives ` +
          'within that.',
    )
    if (!sendError) clear()
  }

  return (
    <form className="card stack" onSubmit={send}>
      <div className="spread">
        <strong>Send a broadcast</strong>
        <span className="muted" style={{ fontSize: '.8rem' }}>
          Exempt from the daily cap — the cap exists to keep the automated ladder
          quiet, not to silence you
        </span>
      </div>

      {borrowedFrom && (
        <div
          className="card card-tight"
          style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}
        >
          <strong style={{ fontSize: '.82rem' }}>
            Using the wording from <span className="mono">{borrowedFrom}</span>
          </strong>
          <p className="muted" style={{ margin: '.2rem 0 0', fontSize: '.78rem' }}>
            Edit it or send as is. It goes out as a broadcast to whoever you target
            below, which is how you see the words on a real phone — it does not
            wait for {borrowedFrom} to actually fire.
          </p>
          <button className="small" style={{ marginTop: '.4rem' }} type="button" onClick={clear}>
            Clear
          </button>
        </div>
      )}

      {templates.length > 0 && (
        <label style={{ maxWidth: '22rem' }}>
          Start from a saved template
          <select
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value)
              if (!t) return
              setTitleEn(t.title_en)
              setTitleAm(t.title_am)
              setBodyEn(t.body_en)
              setBodyAm(t.body_am)
              setBorrowedFrom(null)
            }}
          >
            <option value="">—</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      )}

      <div className="bilingual">
        <label>
          Title (English)
          <input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        </label>
        <label>
          ርዕስ (አማርኛ)
          <input lang="am" value={titleAm} onChange={(e) => setTitleAm(e.target.value)} />
        </label>
      </div>
      <div className="bilingual">
        <label>
          Message (English)
          <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} />
        </label>
        <label>
          መልእክት (አማርኛ)
          <textarea lang="am" value={bodyAm} onChange={(e) => setBodyAm(e.target.value)} />
        </label>
      </div>

      {(missingAm || missingEn) && (titleEn || titleAm || bodyEn || bodyAm) && (
        <p className="problem" style={{ fontSize: '.78rem', margin: 0 }}>
          {missingAm
            ? 'No Amharic written — Amharic readers will get the English text.'
            : 'No English written — English readers will get the Amharic text.'}{' '}
          Nobody is skipped for a missing translation, but nobody proofreads it either.
        </p>
      )}

      <details>
        <summary className="muted" style={{ fontSize: '.8rem', cursor: 'pointer' }}>
          Personalise it — {VARIABLES.length} values you can drop into the text
        </summary>
        <ul className="muted" style={{ fontSize: '.78rem', margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
          {VARIABLES.map((v) => (
            <li key={v.token}>
              <span className="mono">{v.token}</span> — {v.means}
            </li>
          ))}
        </ul>
        <p className="muted" style={{ fontSize: '.78rem', margin: '.4rem 0 0' }}>
          A sentence is dropped for anyone the value is missing for, so nobody reads
          “a 0 day streak”. Write each one in its own sentence and the rest of the
          message still lands.
        </p>
      </details>

      <div className="row" style={{ alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ maxWidth: '18rem' }}>
          Who receives it
          <select
            value={recipient ? 'one' : audience}
            onChange={(e) => {
              if (e.target.value === 'one') {
                setRecipient(members[0]?.id ?? '')
              } else {
                setRecipient('')
                setAudience(e.target.value)
              }
            }}
          >
            {AUDIENCES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
            <option value="one">One member</option>
          </select>
        </label>

        {recipient && (
          <label style={{ maxWidth: '16rem' }}>
            Which member
            <select value={recipient} onChange={(e) => setRecipient(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name || '(no name)'}</option>
              ))}
            </select>
          </label>
        )}

        <label style={{ maxWidth: '16rem' }}>
          When (EAT)
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>
      </div>

      {summary && (
        <div className="card card-tight" style={{ fontSize: '.8rem' }}>
          <strong>{summary.matched} member(s) would receive this</strong>
          <ul className="muted" style={{ margin: '.3rem 0 0', paddingLeft: '1.1rem' }}>
            {summary.no_device > 0 && (
              <li>{summary.no_device} have no phone registered and cannot be reached</li>
            )}
            {summary.muted > 0 && <li>{summary.muted} have muted broadcasts</li>}
            {/*
              * Only once something has been written. An empty message renders to
              * nothing for everyone, so this would otherwise open with "5 would be
              * skipped" before the admin has typed a word.
              */}
            {hasCopy && summary.skipped_no_copy > 0 && (
              <li className="problem">
                {summary.skipped_no_copy} would be skipped — every sentence relies on a
                value they do not have
              </li>
            )}
            {summary.already_today > 0 && (
              <li>
                {summary.already_today} already have two notifications today. This one
                still goes, but that is three.
              </li>
            )}
            {willSkip === 0 && summary.matched > 0 && <li>Everyone matched is reachable.</li>}
          </ul>
        </div>
      )}

      <div className="row" style={{ alignItems: 'end', gap: '1rem', flexWrap: 'wrap' }}>
        <label style={{ maxWidth: '16rem' }}>
          Preview as
          <select value={previewOf} onChange={(e) => void runPreview(e.target.value)}>
            <option value="">—</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name || '(no name)'}</option>
            ))}
          </select>
        </label>
        {preview && (
          <div className="card card-tight" style={{ flex: 1, minWidth: '16rem' }}>
            {preview.body === null ? (
              <span className="problem" style={{ fontSize: '.8rem' }}>
                This member would be skipped — nothing in the message can be said to them.
              </span>
            ) : (
              <>
                <strong style={{ fontSize: '.85rem' }}>{preview.title}</strong>
                <p style={{ margin: '.2rem 0 0', fontSize: '.8rem' }}>{preview.body}</p>
                {/*
                  * Naming the language is not enough once a translation can be
                  * missing: falling back shows English text under an "in Amharic"
                  * label, which reads as a bug rather than as the fallback working.
                  */}
                <span className="muted" style={{ fontSize: '.72rem' }}>
                  {preview.lang === 'am'
                    ? missingAm
                      ? 'reads Amharic — showing the English text, as no Amharic was written'
                      : 'as it arrives, in Amharic'
                    : missingEn
                      ? 'reads English — showing the Amharic text, as no English was written'
                      : 'as it arrives, in English'}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: '.6rem', flexWrap: 'wrap' }}>
        <button
          className="primary"
          type="submit"
          disabled={busy || reach === 0 || (!bodyEn.trim() && !bodyAm.trim())}
        >
          {busy ? 'Working…' : when ? 'Schedule' : 'Send now'}
        </button>
        <button
          className="small"
          type="button"
          onClick={saveTemplate}
          disabled={!bodyEn.trim() && !bodyAm.trim()}
        >
          Save as template
        </button>
        {when && (
          <button className="small" type="button" onClick={() => setWhen('')}>
            Send now instead
          </button>
        )}
      </div>

      {result && <p className="muted">{result}</p>}
    </form>
  )
}

/**
 * Broadcasts that have not gone out yet.
 *
 * They can be cancelled precisely because nothing has been written per member —
 * there is one row to change, not one per recipient.
 */
function Scheduled({ version }: { version: number }) {
  const [rows, setRows] = useState<
    Array<{ id: string; title_en: string; title_am: string; scheduled_at: string }>
  >([])

  const load = useCallback(async () => {
    const { data } = await db
      .from('broadcasts')
      .select('id, title_en, title_am, scheduled_at')
      .eq('status', 'scheduled')
      .order('scheduled_at')
    setRows((data as typeof rows | null) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load, version])

  if (rows.length === 0) return null

  return (
    <section className="card stack">
      <strong>Scheduled</strong>
      <table>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.title_en || r.title_am}</td>
              <td className="muted">
                {instantToEat(r.scheduled_at)} <span className="mono">EAT</span>
              </td>
              <td style={{ textAlign: 'right' }}>
                <button
                  className="small"
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Cancel this broadcast?')) return
                    await db.rpc('cancel_broadcast', { p_broadcast: r.id })
                    void load()
                  }}
                >
                  Cancel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
