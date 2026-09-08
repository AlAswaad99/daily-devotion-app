'use client'

import { useState } from 'react'
import { ConfirmModal } from './ConfirmModal'

/**
 * Delete asks for the name back before it will act.
 *
 * The database refuses to delete anything published or read, so this is not the
 * safety mechanism — it is there to slow down the one case that *is* destructive:
 * a draft row nobody has touched yet.
 */
export function ConfirmDelete({
  label, name, onDelete,
}: {
  label: string
  name: string
  onDelete: () => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button className="small" type="button" onClick={() => setOpen(true)}>
        Delete
      </button>
      {open && (
        <ConfirmModal
          title={`Delete ${label}`}
          body={`This permanently removes this ${label}. The database will refuse if it has ever been published or read.`}
          confirmLabel={`Delete ${label}`}
          tone="danger"
          typeToConfirm={name}
          onCancel={() => setOpen(false)}
          onConfirm={async () => {
            const message = await onDelete()
            if (!message) setOpen(false)
            return message
          }}
        />
      )}
    </>
  )
}
