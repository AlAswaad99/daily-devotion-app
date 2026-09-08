'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { useSession } from '../../lib/session'
import { Icon } from '../../components/Icon'

export default function SignIn() {
  const { session, loading } = useSession()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && session) router.replace('/')
  }, [loading, session, router])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(
        error.message.toLowerCase().includes('invalid login')
          ? 'No account matches that email and password.'
          : error.message,
      )
    }
  }

  return (
    // Centred on the viewport: this page has no navigation, so there is no content
    // column for it to sit inside.
    <div className="signin">
      <div className="signin-inner">
        <div className="signin-brand">
          <div className="mark">
            {/* eslint-disable-next-line @next/next/no-img-element -- the favicon itself, at its own public route */}
            <img src="/icon.png" alt="" />
          </div>
          <h1>Temuagn Admin</h1>
          <p>Content, scheduling and analytics for the ministry.</p>
        </div>

        <form className="signin-card" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="you@ministry.org"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && (
            <p className="signin-error" role="alert">
              <span style={{ display: 'flex', flex: 'none', marginTop: 1 }}>
                <Icon name="alert" size={14} strokeWidth={1.8} />
              </span>
              {error}
            </p>
          )}

          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/*
          There is no self-serve sign-up here on purpose: a member joins the app with
          a join code, and only an existing admin can grant the admin role. Saying so
          saves someone hunting for a "create account" link that will never exist.
        */}
        <p className="signin-foot">
          Accounts are created by an existing administrator.
        </p>
      </div>
    </div>
  )
}
