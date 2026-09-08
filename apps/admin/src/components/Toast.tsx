'use client'

import { createContext, useCallback, useContext, useRef, useState } from 'react'

interface ToastItem {
  id: number
  kind: 'success' | 'error'
  message: string
}

const ToastContext = createContext<{ push: (kind: ToastItem['kind'], message: string) => void } | null>(null)

/**
 * Where informational messages go instead of a modal — nothing here asks a
 * question, so nothing here should block the screen. Reserve modals for
 * anything the admin has to decide; this is for "it worked" / "it didn't."
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const push = useCallback((kind: ToastItem['kind'], message: string) => {
    const id = nextId.current++
    setItems((prev) => [...prev, { id, kind, message }])
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }, 5000)
  }, [])

  const dismiss = (id: number) => setItems((prev) => prev.filter((i) => i.id !== id))

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.kind}`} role="status">
            <span>{item.message}</span>
            <button
              className="icon"
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
