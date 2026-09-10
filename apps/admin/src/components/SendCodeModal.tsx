'use client'

import { useState } from 'react'
import { db } from '../lib/db'
import { Modal } from './Modal'

/**
 * Pushes a join code to someone's linked Telegram chat, via the `telegram-nudge`
 * function. Shared between the Onboarding page (someone mid-join, no profile yet)
 * and the Members page (an existing member who needs a fresh one for some other
 * reason) — the send itself doesn't care which situation it is, only `phone` and
 * which codes are worth offering differ between the two callers.
 */
export function SendCodeModal({
  phone, available, onClose, onSent,
}: {
  phone: string
  available: Array<{ code: string }>
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
