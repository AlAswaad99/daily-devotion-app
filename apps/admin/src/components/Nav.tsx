'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { useSession } from '../lib/session'

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/books', label: 'Content' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/users', label: 'Users' },
]

export function Nav() {
  const path = usePathname()
  const { profile, signOut } = useSession()
  const [attention, setAttention] = useState<{ books: number; schedule: number }>({
    books: 0,
    schedule: 0,
  })

  // A count beside the link is the cheapest way to say "something needs you here"
  // without making an admin open every page to find out.
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const { data } = await db.rpc('content_health')
      const health = (data as Array<Record<string, number>> | null)?.[0]
      if (cancelled || !health) return
      setAttention({
        books: Number(health.incomplete_days ?? 0) + Number(health.awaiting_review ?? 0),
        schedule:
          Number(health.unscheduled_days ?? 0) + (Number(health.runway_days ?? 99) <= 3 ? 1 : 0),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [profile, path])

  if (path === '/sign-in') return null

  const badgeFor = (href: string) =>
    href === '/books' ? attention.books : href === '/schedule' ? attention.schedule : 0

  return (
    <nav className="nav">
      <div className="nav-brand">
        Abide <span>Admin</span>
      </div>

      {LINKS.map((link) => {
        const badge = badgeFor(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            className="nav-link"
            aria-current={path === link.href ? 'page' : undefined}
          >
            <span>{link.label}</span>
            {badge > 0 && <span className="nav-badge">{badge}</span>}
          </Link>
        )
      })}

      {profile && (
        <div className="nav-foot">
          <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{profile.display_name}</div>
          <div className="faint" style={{ fontSize: '.72rem', marginBottom: '.4rem' }}>
            {profile.role}
          </div>
          <button className="small" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
