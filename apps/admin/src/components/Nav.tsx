'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { useSession } from '../lib/session'
import { Icon, type IconName } from './Icon'

/**
 * Three groups rather than one flat list.
 *
 * "Monitor" is what you open to find out; "Content" is what you open to change;
 * "People" is everything else. Five undifferentiated links gave no clue which of
 * them answered a given question, and the sixth (Analytics) would have made it
 * worse.
 */
const GROUPS: Array<{
  label: string
  items: Array<{ href: string; label: string; icon: IconName }>
}> = [
  {
    label: 'Monitor',
    items: [
      { href: '/', label: 'Overview', icon: 'overview' },
      { href: '/analytics', label: 'Analytics', icon: 'analytics' },
    ],
  },
  {
    label: 'Content',
    items: [
      { href: '/books', label: 'Library', icon: 'library' },
      { href: '/schedule', label: 'Schedule', icon: 'schedule' },
      { href: '/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    label: 'People',
    items: [{ href: '/users', label: 'Members', icon: 'users' }],
  },
]

interface Attention {
  books: number
  schedule: number
  /** A runway this short is not "5 things to do" — it is a deadline. */
  scheduleIsCritical: boolean
}

interface Tenancy {
  ministry: string
  church: string
}

export function Nav() {
  const path = usePathname()
  const { profile, signOut } = useSession()
  const [attention, setAttention] = useState<Attention>({
    books: 0,
    schedule: 0,
    scheduleIsCritical: false,
  })
  const [tenancy, setTenancy] = useState<Tenancy | null>(null)

  // A count beside the link is the cheapest way to say "something needs you here"
  // without making an admin open every page to find out.
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const { data } = await db.rpc('content_health')
      const health = (data as Array<Record<string, number>> | null)?.[0]
      if (cancelled || !health) return
      const runway = Number(health.runway_days ?? 99)
      setAttention({
        books: Number(health.incomplete_days ?? 0) + Number(health.awaiting_review ?? 0),
        schedule: Number(health.unscheduled_days ?? 0) + (runway <= 7 ? 1 : 0),
        scheduleIsCritical: runway <= 3,
      })
    })()
    return () => {
      cancelled = true
    }
  }, [profile, path])

  // Which ministry an admin is looking at is not obvious from the data on screen,
  // and it is the one thing every number here is scoped by.
  useEffect(() => {
    if (!profile) return
    let cancelled = false
    void (async () => {
      const [{ data: church }, { data: ministry }] = await Promise.all([
        db.from('churches').select('name_en').eq('id', profile.church_id).maybeSingle(),
        db.from('ministries').select('name_en').eq('id', profile.ministry_id).maybeSingle(),
      ])
      if (cancelled) return
      setTenancy({
        church: (church as { name_en: string } | null)?.name_en ?? '',
        ministry: (ministry as { name_en: string } | null)?.name_en ?? '',
      })
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  const badgeFor = (href: string) =>
    href === '/books' ? attention.books : href === '/schedule' ? attention.schedule : 0

  const initials = (profile?.display_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <nav className="rail">
      <div className="brand">
        <div className="brand-mark">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3c2.6 2.4 4.2 4.7 4.2 7.2A4.2 4.2 0 0 1 10 14.4a4.2 4.2 0 0 1-4.2-4.2C5.8 7.7 7.4 5.4 10 3z" />
            <path d="M10 17v-2.6" />
          </svg>
        </div>
        <div className="brand-name">Temuagn</div>
        <div className="brand-tag">Admin</div>
      </div>

      {tenancy && (
        <div className="rail-context">
          <div className="who">{tenancy.ministry}</div>
          <div className="where">{tenancy.church}</div>
        </div>
      )}

      {GROUPS.map((group) => (
        <div className="rail-group" key={group.label}>
          <div className="rail-label">{group.label}</div>
          {group.items.map((link) => {
            const badge = badgeFor(link.href)
            const tone = link.href === '/schedule' && attention.scheduleIsCritical ? 'crit' : 'warn'
            return (
              <Link
                key={link.href}
                href={link.href}
                className="rail-link"
                aria-current={path === link.href ? 'page' : undefined}
              >
                <Icon name={link.icon} />
                <span>{link.label}</span>
                {badge > 0 && <span className={`rail-count ${tone}`}>{badge}</span>}
              </Link>
            )
          })}
        </div>
      ))}

      {profile && (
        <div className="rail-foot">
          <span className="avatar">{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--shell-ink)', lineHeight: 1.3 }}>
              {profile.display_name}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--shell-ink-3)' }}>
              {profile.role === 'admin' ? 'Administrator' : profile.role}
            </div>
          </div>
          <button onClick={() => void signOut()} title="Sign out" aria-label="Sign out">
            <Icon name="signOut" size={15} />
          </button>
        </div>
      )}
    </nav>
  )
}
