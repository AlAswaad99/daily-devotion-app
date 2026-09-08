'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'

/**
 * The one modal shell the dashboard uses — every dialog (confirm, type-to-confirm,
 * a single prompt) is this plus content, so there is exactly one place that owns
 * focus, Escape, and the backdrop rather than a native `alert`/`confirm`/`prompt`.
 */
export function Modal({
  title, onClose, children, width = 420,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
  width?: number
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: width }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="icon" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
