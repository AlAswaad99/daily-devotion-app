'use client'

import { useState } from 'react'
import { Modal } from './Modal'

/**
 * Every decision that used to be a native `confirm()` — plain Yes/Cancel, or type-
 * the-name-back for the ones with real blast radius. `onConfirm` returning a string
 * is treated as an error to show inline; returning nothing closes the modal, so the
 * caller doesn't have to manage open/close state for the happy path.
 */
export function ConfirmModal({
  title, body, confirmLabel = 'Confirm', tone = 'default', typeToConfirm, onConfirm, onCancel,
}: {
  title: string
  body: React.ReactNode
  confirmLabel?: string
  tone?: 'default' | 'danger'
  /** If set, the confirm button stays disabled until this exact string is typed. */
  typeToConfirm?: string
  onConfirm: () => Promise<string | null | void>
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm

  const confirm = async () => {
    setBusy(true)
    setError(null)
    const message = await onConfirm()
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="stack">
        <div style={{ fontSize: '12.5px', color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
        {typeToConfirm !== undefined && (
          <label>
            {`Type “${typeToConfirm}” to confirm`}
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
        )}
        {error && <p className="problem" style={{ margin: 0 }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'danger' : 'primary'}
            disabled={busy || locked}
            onClick={() => void confirm()}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
