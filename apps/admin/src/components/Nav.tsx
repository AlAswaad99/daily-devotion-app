'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from '../lib/session'

/** Ordered as the spec orders the work, not alphabetically. */
const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/books', label: 'Books & days' },
  { href: '/import', label: 'Import' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/users', label: 'Users' },
]

export function Nav() {
  const path = usePathname()
  const { profile, signOut } = useSession()

  if (path === '/sign-in') return null

  return (
    <nav className="nav">
      <h1>Abide</h1>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={path === link.href ? 'page' : undefined}
        >
          {link.label}
        </Link>
      ))}
      {profile && (
        <div style={{ marginTop: '1.5rem', padding: '0 .6rem' }}>
          <div className="muted" style={{ fontSize: '.78rem' }}>{profile.display_name}</div>
          <button
            style={{ marginTop: '.4rem', padding: '.25rem .7rem', fontSize: '.8rem' }}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
