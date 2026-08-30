'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useSession } from '../lib/session'

/**
 * A convenience, not a security boundary. Every table this dashboard touches is
 * governed by RLS policies that check the admin role, so a non-admin who got past
 * this component would still see and change nothing. This exists so they get an
 * explanation instead of a page of empty tables.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !session) router.replace('/sign-in')
  }, [loading, session, router])

  if (loading) return <p className="muted">Loading…</p>
  if (!session) return null

  if (profile && profile.role !== 'admin') {
    return (
      <div className="card">
        <h2>Not an admin</h2>
        <p className="sub">
          This account can sign in but has no admin role, so the database returns
          nothing to it. Ask an existing admin to change your role.
        </p>
      </div>
    )
  }

  return <>{children}</>
}
