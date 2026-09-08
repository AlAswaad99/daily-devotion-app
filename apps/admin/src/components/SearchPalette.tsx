'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { db } from '../lib/db'
import { Icon } from './Icon'

/**
 * ⌘K/Ctrl+K anywhere in the dashboard, or a click on the top bar's search field.
 *
 * Three parallel, admin-gated table reads rather than a dedicated RPC — the same
 * `devotion_days`/`books`/`profiles` reads every other page already does through
 * RLS, just filtered instead of paged. That is enough at this ministry's scale;
 * a fuzzier or ranked search is a problem for when the tables are large enough
 * that ilike stops being fast, not before.
 */

interface DayResult {
  id: string
  topic_en: string | null
  topic_am: string | null
  scheduled_date: string
  status: string
}
interface BookResult {
  id: string
  title_en: string | null
  title_am: string | null
  status: string
}
interface MemberResult {
  id: string
  display_name: string
}
interface Results {
  days: DayResult[]
  books: BookResult[]
  members: MemberResult[]
}
const EMPTY: Results = { days: [], books: [], members: [] }

/** PostgREST's `.or()` mini-language treats `,()` as syntax; strip rather than escape. */
const sanitise = (q: string) => q.replace(/[,()]/g, ' ').trim()

async function runSearch(query: string): Promise<Results> {
  const like = `%${sanitise(query)}%`
  const [days, books, members] = await Promise.all([
    db
      .from('devotion_days')
      .select('id, topic_en, topic_am, scheduled_date, status')
      .or(`topic_en.ilike.${like},topic_am.ilike.${like}`)
      .order('scheduled_date', { ascending: false })
      .limit(6),
    db
      .from('books')
      .select('id, title_en, title_am, status')
      .or(`title_en.ilike.${like},title_am.ilike.${like}`)
      .limit(6),
    db.from('profiles').select('id, display_name').ilike('display_name', like).limit(6),
  ])
  return {
    days: (days.data as DayResult[] | null) ?? [],
    books: (books.data as BookResult[] | null) ?? [],
    members: (members.data as MemberResult[] | null) ?? [],
  }
}

/** One flat, ordered list — days, then books, then members — for arrow-key navigation. */
function flatten(results: Results): Array<{ key: string; href: string }> {
  return [
    ...results.days.map((d) => ({ key: `day:${d.id}`, href: `/days/${d.id}` })),
    ...results.books.map((b) => ({ key: `book:${b.id}`, href: `/books/${b.id}` })),
    ...results.members.map((m) => ({ key: `member:${m.id}`, href: '/users' })),
  ]
}

export function SearchPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const close = () => setOpen(false)
  const go = (href: string) => {
    close()
    router.push(href)
  }

  // The shortcut works from anywhere — it doesn't need the field itself focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults(EMPTY)
    setActive(0)
    // The portal's input isn't in the DOM on the same tick this fires.
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const trimmed = query.trim()
  useEffect(() => {
    if (!open || trimmed.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      void runSearch(trimmed).then((rows) => {
        setResults(rows)
        setActive(0)
        setLoading(false)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [trimmed, open])

  const flat = useMemo(() => flatten(results), [results])

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flat[active]) {
      go(flat[active].href)
    }
  }

  const hasQuery = trimmed.length >= 2
  const hasResults = flat.length > 0

  return (
    <>
      <button type="button" className="search" onClick={() => setOpen(true)}>
        <Icon name="search" size={14} />
        <span>Search days, books, members…</span>
        <span className="kbd">⌘K</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="palette-scrim" onClick={close}>
            <div
              className="palette"
              role="dialog"
              aria-modal="true"
              aria-label="Search"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="palette-input">
                <Icon name="search" size={16} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onInputKey}
                  placeholder="Search days, books, members…"
                  aria-label="Search days, books, members"
                />
                {loading && <span className="palette-spinner" aria-hidden="true" />}
              </div>

              <div className="palette-results">
                {!hasQuery ? (
                  <p className="muted palette-hint">Type at least two characters.</p>
                ) : !loading && !hasResults ? (
                  <p className="muted palette-hint">Nothing matches &ldquo;{trimmed}&rdquo;.</p>
                ) : (
                  <>
                    {results.days.length > 0 && (
                      <div className="palette-group">
                        <div className="palette-group-label">Days</div>
                        {results.days.map((d) => {
                          const i = flat.findIndex((f) => f.key === `day:${d.id}`)
                          return (
                            <button
                              key={d.id}
                              type="button"
                              className={`palette-row${i === active ? ' is-active' : ''}`}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => go(`/days/${d.id}`)}
                            >
                              <span className="palette-row-title">
                                {d.topic_en || d.topic_am || 'Untitled day'}
                              </span>
                              <span className="palette-row-meta">
                                {d.scheduled_date}
                                {d.status === 'archived' && <span className="pill archived">Archived</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {results.books.length > 0 && (
                      <div className="palette-group">
                        <div className="palette-group-label">Books</div>
                        {results.books.map((b) => {
                          const i = flat.findIndex((f) => f.key === `book:${b.id}`)
                          return (
                            <button
                              key={b.id}
                              type="button"
                              className={`palette-row${i === active ? ' is-active' : ''}`}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => go(`/books/${b.id}`)}
                            >
                              <span className="palette-row-title">
                                {b.title_en || b.title_am || 'Untitled book'}
                              </span>
                              {b.status === 'archived' && (
                                <span className="palette-row-meta">
                                  <span className="pill archived">Archived</span>
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {results.members.length > 0 && (
                      <div className="palette-group">
                        <div className="palette-group-label">Members</div>
                        {results.members.map((m) => {
                          const i = flat.findIndex((f) => f.key === `member:${m.id}`)
                          return (
                            <button
                              key={m.id}
                              type="button"
                              className={`palette-row${i === active ? ' is-active' : ''}`}
                              onMouseEnter={() => setActive(i)}
                              onClick={() => go('/users')}
                            >
                              <span className="palette-row-title">{m.display_name}</span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
