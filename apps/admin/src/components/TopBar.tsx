'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db } from '../lib/db'
import { Icon } from './Icon'

/**
 * The bar carries the three things that are true on every page: where you are,
 * how to get anywhere, and what today is in both calendars.
 *
 * Today is not decoration. Every date on every page is an Ethiopian date over a
 * Gregorian one, and `ministry_today()` — not the laptop's clock — decides which
 * day the ministry is on, because an admin abroad would otherwise schedule against
 * the wrong day.
 */
const CRUMBS: Record<string, { section: string; page: string }> = {
  '/': { section: 'Monitor', page: 'Overview' },
  '/analytics': { section: 'Monitor', page: 'Analytics' },
  '/books': { section: 'Content', page: 'Library' },
  '/books/import': { section: 'Content', page: 'Import' },
  '/schedule': { section: 'Content', page: 'Schedule' },
  '/notifications': { section: 'Content', page: 'Notifications' },
  '/users': { section: 'People', page: 'Members' },
}

function crumbsFor(path: string): { section: string; page: string } {
  if (CRUMBS[path]) return CRUMBS[path]
  if (path.startsWith('/books/')) return { section: 'Content', page: 'Book' }
  if (path.startsWith('/days/')) return { section: 'Content', page: 'Day' }
  return { section: 'Abide', page: 'Admin' }
}

export function TopBar() {
  const path = usePathname()
  const [today, setToday] = useState<string | null>(null)
  const { section, page } = crumbsFor(path)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await db.rpc('ministry_today')
      if (!cancelled) setToday((data as string | null) ?? new Date().toISOString().slice(0, 10))
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>{section}</span>
        <Icon name="chevron" size={13} strokeWidth={1.6} />
        <span className="here">{page}</span>
      </div>

      <div className="search" role="search">
        <Icon name="search" size={14} />
        <span>Search days, books, members…</span>
        <span className="kbd">⌘K</span>
      </div>

      {today && (
        <div className="today-chip" title="Today in the ministry's timezone">
          <span className="ec">{formatEthiopic(today, 'en')}</span>
          <span className="gr">{today}</span>
        </div>
      )}

      <button className="icon" title="Keyboard shortcuts and help" aria-label="Help">
        <Icon name="help" size={15} />
      </button>
    </header>
  )
}
