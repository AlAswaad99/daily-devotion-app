'use client'

import { useState } from 'react'

/**
 * Delete asks for the name back before it will act.
 *
 * The database refuses to delete anything published or read, so this is not the
 * safety mechanism — it is there to slow down the one case that *is* destructive:
 * a draft round with a book and days nobody has touched yet.
 */
export function ConfirmDelete({
  label, name, onDelete,
}: {
  label: string
  name: string
  onDelete: () => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) {
    return (
      <button className="small" onClick={() => setOpen(true)}>
        Delete
      </button>
    )
  }

  return (
    <span className="row" style={{ gap: '.35rem' }}>
      <input
        style={{ width: '9rem', padding: '.2rem .4rem', fontSize: '.8rem' }}
        placeholder={`Type “${name}”`}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoFocus
      />
      <button
        className="small"
        style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}
        disabled={busy || typed.trim() !== name}
        onClick={async () => {
          setBusy(true)
          const message = await onDelete()
          setBusy(false)
          if (message) setError(message)
          else setOpen(false)
        }}
      >
        {busy ? '…' : `Delete ${label}`}
      </button>
      <button
        className="small"
        onClick={() => {
          setOpen(false)
          setError(null)
        }}
      >
        Cancel
      </button>
      {error && (
        <span className="problem" style={{ fontSize: '.75rem', maxWidth: '30rem' }}>
          {error}
        </span>
      )}
    </span>
  )
}
