'use client'

import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { useSession } from '../../lib/session'
import { RequireAdmin } from '../../components/RequireAdmin'
import { Modal } from '../../components/Modal'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useToast } from '../../components/Toast'

interface PipelineRow {
  phone: string
  telegram_linked_at: string | null
  verified_at: string | null
  has_profile: boolean
  display_name: string | null
}

interface JoinCodeRow {
  code: string
  created_at: string
  expires_at: string | null
  max_uses: number
  uses: number
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no O/0/I/1 — easy to misread
const generateCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('')

const isExpired = (row: JoinCodeRow) => row.expires_at !== null && new Date(row.expires_at) < new Date()

export default function OnboardingPage() {
  return (
    <RequireAdmin>
      <OnboardingInner />
    </RequireAdmin>
  )
}

function OnboardingInner() {
  const { profile } = useSession()
  const { push } = useToast()
  const [pipeline, setPipeline] = useState<PipelineRow[]>([])
  const [codes, setCodes] = useState<JoinCodeRow[]>([])
  const [generating, setGenerating] = useState(false)
  const [resettingPhone, setResettingPhone] = useState<string | null>(null)
  const [revokingCode, setRevokingCode] = useState<string | null>(null)
  const [sendingTo, setSendingTo] = useState<PipelineRow | null>(null)

  const refresh = useCallback(async () => {
    if (!profile) return
    const [{ data: rows, error: pipelineError }, { data: codeRows, error: codesError }] = await Promise.all([
      db.rpc('admin_onboarding_pipeline'),
      db
        .from('join_codes')
        .select('code, created_at, expires_at, max_uses, uses')
        .is('redeemed_by', null)
        .order('created_at', { ascending: false }),
    ])
    if (pipelineError) push('error', pipelineError.message)
    if (codesError) push('error', codesError.message)
    setPipeline(((rows as PipelineRow[] | null) ?? []).filter((r) => !r.has_profile))
    setCodes((codeRows as JoinCodeRow[] | null) ?? [])
  }, [profile, push])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (cancelled) return
      await refresh()
    })()
    return () => {
      cancelled = true
    }
  }, [refresh])

  const available = codes.filter((c) => !isExpired(c) && c.uses < c.max_uses)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Onboarding</h1>
          <p className="page-sub">
            Everyone between opening the bot and finishing sign-up — people the Members
            page can&rsquo;t show yet, because they don&rsquo;t have a profile.
          </p>
        </div>
        <div className="head-actions">
          <button className="primary" onClick={() => setGenerating(true)}>
            Generate codes
          </button>
        </div>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h3>Available codes ({available.length})</h3>
        {codes.length === 0 ? (
          <p className="muted" style={{ fontSize: '.85rem' }}>
            None yet — generate a batch to hand out.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Created</th>
                <th>Status</th>
                <th style={{ width: '8rem' }} />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = isExpired(c)
                return (
                  <tr key={c.code}>
                    <td className="mono t-strong">{c.code}</td>
                    <td className="muted">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td>
                      <span className={`pill ${expired ? 'archived' : 'published'}`}>
                        {expired ? 'revoked' : 'available'}
                      </span>
                    </td>
                    <td>
                      {!expired && (
                        <button className="small" onClick={() => setRevokingCode(c.code)}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h3>In progress ({pipeline.length})</h3>
        {pipeline.length === 0 ? (
          <p className="muted" style={{ fontSize: '.85rem' }}>
            Nobody stuck mid-onboarding right now.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Phone</th>
                <th>Telegram</th>
                <th>Verified</th>
                <th style={{ width: '16rem' }} />
              </tr>
            </thead>
            <tbody>
              {pipeline.map((row) => (
                <tr key={row.phone}>
                  <td className="mono">{row.phone}</td>
                  <td>
                    {row.telegram_linked_at ? (
                      <span className="pill published">activated</span>
                    ) : (
                      <span className="pill draft">not activated</span>
                    )}
                  </td>
                  <td>
                    {row.verified_at ? (
                      <span className="pill published">verified</span>
                    ) : (
                      <span className="pill draft">not yet</span>
                    )}
                  </td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {row.verified_at && (
                        <button className="small" onClick={() => setSendingTo(row)}>
                          Send code
                        </button>
                      )}
                      {row.telegram_linked_at && (
                        <button className="small" onClick={() => setResettingPhone(row.phone)}>
                          Reset Telegram
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {generating && profile && (
        <GenerateCodesModal
          ministryId={profile.ministry_id}
          onClose={() => setGenerating(false)}
          onDone={async () => {
            setGenerating(false)
            await refresh()
          }}
        />
      )}

      {revokingCode && (
        <ConfirmModal
          title="Revoke code"
          body={`“${revokingCode}” will no longer work. This doesn't affect anyone who already used a different code.`}
          confirmLabel="Revoke"
          tone="danger"
          onCancel={() => setRevokingCode(null)}
          onConfirm={async () => {
            const { error } = await db
              .from('join_codes')
              .update({ expires_at: new Date().toISOString() })
              .eq('code', revokingCode)
            if (error) return error.message
            setRevokingCode(null)
            push('success', `${revokingCode} revoked.`)
            await refresh()
            return null
          }}
        />
      )}

      {resettingPhone && (
        <ConfirmModal
          title="Reset Telegram link"
          body={`Clears ${resettingPhone}'s Telegram activation. They'll need to open the bot and tap Start again before they can receive a new code.`}
          confirmLabel="Reset"
          tone="danger"
          onCancel={() => setResettingPhone(null)}
          onConfirm={async () => {
            const { error } = await db.from('telegram_links').delete().eq('phone', resettingPhone)
            if (error) return error.message
            setResettingPhone(null)
            push('success', `Telegram link reset for ${resettingPhone}.`)
            await refresh()
            return null
          }}
        />
      )}

      {sendingTo && (
        <SendCodeModal
          phone={sendingTo.phone}
          available={available}
          onClose={() => setSendingTo(null)}
          onSent={() => {
            setSendingTo(null)
            push('success', `Code sent to ${sendingTo.phone}.`)
          }}
        />
      )}
    </>
  )
}

function GenerateCodesModal({
  ministryId, onClose, onDone,
}: {
  ministryId: string
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [count, setCount] = useState(10)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    const seen = new Set<string>()
    while (seen.size < count) seen.add(generateCode())
    const { error: insertError } = await db.from('join_codes').insert(
      [...seen].map((code) => ({ code, ministry_id: ministryId, max_uses: 1 })),
    )
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    await onDone()
  }

  return (
    <Modal title="Generate codes" onClose={onClose}>
      <div className="stack">
        <label>
          How many?
          <input
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(200, Number(e.target.value))))}
          />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: '.8rem' }}>
          Each code works once. Hand them out however you already do — a printed
          list, read aloud at an event, one at a time.
        </p>
        {error && <p className="problem" style={{ margin: 0 }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Generating…' : `Generate ${count}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SendCodeModal({
  phone, available, onClose, onSent,
}: {
  phone: string
  available: JoinCodeRow[]
  onClose: () => void
  onSent: () => void
}) {
  const [code, setCode] = useState(available[0]?.code ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!code) return
    setBusy(true)
    setError(null)
    const { data, error: invokeError } = await db.functions.invoke('telegram-nudge', {
      body: { phone, code },
    })
    setBusy(false)
    const failure = invokeError?.message ?? (data as { error?: string } | null)?.error
    if (failure) {
      setError(failure)
      return
    }
    onSent()
  }

  return (
    <Modal title="Send join code" onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Sends a code to <span className="mono">{phone}</span> over Telegram.
        </p>
        {available.length === 0 ? (
          <p className="problem" style={{ margin: 0 }}>
            No available codes — generate a batch first.
          </p>
        ) : (
          <label>
            Code
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              {available.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="problem" style={{ margin: 0 }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !code} onClick={() => void submit()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
