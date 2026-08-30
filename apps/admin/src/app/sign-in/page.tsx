'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { db } from '../../lib/db'
import { useSession } from '../../lib/session'

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
    <div className="centered-page">
      <div className="centered-card">
        <div className="page-head" style={{ textAlign: 'center' }}>
          <h2>Abide Admin</h2>
          <p className="sub" style={{ margin: '0 auto' }}>
            Sign in with your ministry account.
          </p>
        </div>
        <form className="stack card" onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="problem">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
