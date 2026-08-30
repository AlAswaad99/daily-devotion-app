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

      {profile && <Broadcast profile={profile} />}

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
                        <button className="small" onClick={() => void toggle(template)}>
                          {template.enabled ? 'Turn off' : 'Turn on'}
                        </button>
                        <button
                          className="small"
                          onClick={() =>
                            setEditing(editing === template.id ? null : template.id)
                          }
                        >
                          {editing === template.id ? 'Cancel' : 'Copy'}
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

function Broadcast({ profile }: { profile: AdminProfile }) {
  const [titleEn, setTitleEn] = useState('')
  const [titleAm, setTitleAm] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [bodyAm, setBodyAm] = useState('')
  const [audience, setAudience] = useState('everyone')
  const [reach, setReach] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  // How many people this would reach, shown before it reaches them.
  useEffect(() => {
    let cancelled = false
    const target =
      audience === 'active7'
        ? { active_within_days: 7 }
        : audience === 'slipping'
          ? { streak_below: 3 }
          : audience === 'committed'
            ? { streak_at_least: 7 }
            : {}

    void (async () => {
      const { data } = await db.rpc('broadcast_reach', { p_target: target })
      if (!cancelled) setReach(Number(data ?? 0))
    })()
    return () => {
      cancelled = true
    }
  }, [audience])

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!window.confirm(`Send this to ${reach ?? 0} member(s)? It cannot be recalled.`)) return

    const target =
      audience === 'active7'
        ? { active_within_days: 7 }
        : audience === 'slipping'
          ? { streak_below: 3 }
          : audience === 'committed'
            ? { streak_at_least: 7 }
            : {}

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
        status: 'scheduled',
      })
      .select('id')
      .single()

    if (error) {
      setBusy(false)
      setResult(error.message)
      return
    }

    const { data: sent, error: sendError } = await db.rpc('send_broadcast', {
      p_broadcast: (created as { id: string }).id,
    })
    setBusy(false)
    setResult(sendError ? sendError.message : `Queued for ${sent} member(s).`)

    if (!sendError) {
      setTitleEn('')
      setTitleAm('')
      setBodyEn('')
      setBodyAm('')
    }
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
      <div className="bilingual">
        <label>
          Message (English)
          <textarea value={bodyEn} onChange={(e) => setBodyEn(e.target.value)} required />
        </label>
        <label>
          መልእክት (አማርኛ)
          <textarea lang="am" value={bodyAm} onChange={(e) => setBodyAm(e.target.value)} required />
        </label>
      </div>

      <div className="row" style={{ alignItems: 'end', gap: '1rem' }}>
        <label style={{ maxWidth: '18rem' }}>
          Who receives it
          <select value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="everyone">Everyone in the ministry</option>
            <option value="active7">Read something in the last 7 days</option>
            <option value="slipping">Streak under 3 — slipping away</option>
            <option value="committed">Streak of 7 or more</option>
          </select>
        </label>
        <span className="muted" style={{ fontSize: '.85rem' }}>
          {reach === null ? 'counting…' : `${reach} member(s)`}
        </span>
        <button className="primary" type="submit" disabled={busy || reach === 0}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>

      {result && <p className="muted">{result}</p>}
    </form>
  )
}
