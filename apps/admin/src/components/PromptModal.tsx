'use client'

import { useState } from 'react'
import { Modal } from './Modal'

/** Replaces `window.prompt` — a single labelled text field, Save or Cancel. */
export function PromptModal({
  title, label, placeholder, initialValue = '', confirmLabel = 'Save', onSubmit, onCancel,
}: {
  title: string
  label: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  onSubmit: (value: string) => Promise<string | null | void>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!value.trim() || busy) return
    setBusy(true)
    setError(null)
    const message = await onSubmit(value.trim())
    setBusy(false)
    if (message) setError(message)
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <div className="stack">
        <label>
          {label}
          <input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </label>
        {error && <p className="problem" style={{ margin: 0 }}>{error}</p>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || !value.trim()}
            onClick={() => void submit()}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
