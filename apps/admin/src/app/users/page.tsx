'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db } from '../../lib/db'
import { useSession } from '../../lib/session'
import { RequireAdmin } from '../../components/RequireAdmin'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { SplitBar, SERIES } from '../../components/charts'
import { SendCodeModal } from '../../components/SendCodeModal'
import { useToast } from '../../components/Toast'

interface Member {
  id: string
  display_name: string
  role: 'user' | 'admin'
  ui_language: 'en' | 'am'
  part_of_day: string
  joined_on: string
}

interface JoinCode {
  code: string
  max_uses: number
  uses: number
  expires_at: string | null
  redeemed_by: string | null
}

interface Bucket {
  bucket: string
  members: number
}

const isExpired = (c: JoinCode) => c.expires_at !== null && new Date(c.expires_at) < new Date()

async function fetchMembers(): Promise<{
  members: Member[]
  codes: JoinCode[]
  streaks: Bucket[]
}> {
  const [{ data: m }, { data: c }, { data: s }] = await Promise.all([
    db
      .from('profiles')
      .select('id, display_name, role, ui_language, part_of_day, joined_on')
      .order('joined_on'),
    db.from('join_codes').select('code, max_uses, uses, expires_at, redeemed_by'),
    db.rpc('ministry_streaks'),
  ])
  return {
    members: (m as Member[] | null) ?? [],
    codes: (c as JoinCode[] | null) ?? [],
    streaks: (s as Bucket[] | null) ?? [],
  }
}

export default function Users() {
  return (
    <RequireAdmin>
      <UsersInner />
    </RequireAdmin>
  )
}

function UsersInner() {
  const { profile } = useSession()
  const { push } = useToast()
  const [members, setMembers] = useState<Member[]>([])
  const [codes, setCodes] = useState<JoinCode[]>([])
  const [streaks, setStreaks] = useState<Bucket[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sendingTo, setSendingTo] = useState<Member | null>(null)
  const [sendPhone, setSendPhone] = useState<string | null>(null)
  const [sendCodes, setSendCodes] = useState<Array<{ code: string }>>([])
  const [phoneError, setPhoneError] = useState<string | null>(null)

  // Fetchers return data; effects set state. Keeping those separate is what lets
  // the same function serve both the initial load and a refresh after an edit.
  const load = useCallback(async () => {
    const rows = await fetchMembers()
    setMembers(rows.members)
    setCodes(rows.codes)
    setStreaks(rows.streaks)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await fetchMembers()
      if (!cancelled) {
        setMembers(rows.members)
        setCodes(rows.codes)
        setStreaks(rows.streaks)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setRole = async (member: Member, role: 'user' | 'admin') => {
    setBusy(member.id)
    // Through a function, not a direct update: `profiles` is self-update only, so
    // a PATCH from here would silently affect no rows.
    const { error } = await db.rpc('set_member_role', { p_user: member.id, p_role: role })
    if (error) push('error', error.message)
    await load()
    setBusy(null)
  }

  /*
   * The Onboarding page's own nudge only ever reaches someone with no profile
   * yet (has_profile is filtered out there) — an existing member who needs a
   * fresh code for some other reason (lost access, a reinstall gone wrong)
   * isn't reachable from there at all. `profiles` itself carries no phone
   * number, so it's fetched on demand rather than joined into every row.
   *
   * A member already has a code — the one they redeemed originally, tied to
   * their account — so that's what gets offered rather than a pool of unused
   * codes meant for someone who isn't them yet. redeem_join_code returns an
   * existing profile untouched now regardless of whether the code it's given
   * is still valid, so resending an already-fully-used code is safe: it just
   * proves who they are, it doesn't get consumed again.
   */
  const openSendCode = async (member: Member) => {
    setSendingTo(member)
    setSendPhone(null)
    setPhoneError(null)
    const ownCode = codes.find((c) => c.redeemed_by === member.id)
    setSendCodes(
      ownCode ? [{ code: ownCode.code }] : codes.filter((c) => !isExpired(c) && c.uses < c.max_uses),
    )
    setBusy(member.id)
    const { data, error } = await db.rpc('admin_member_phone', { p_user: member.id })
    setBusy(null)
    if (error || !data) {
      setPhoneError(error?.message ?? 'No phone on file for this member.')
      return
    }
    setSendPhone(data as string)
  }

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return members
    return members.filter((m) => m.display_name.toLowerCase().includes(needle))
  }, [members, query])

  const amharic = members.filter((m) => m.ui_language === 'am').length
  const english = members.filter((m) => m.ui_language === 'en').length
  const admins = members.filter((m) => m.role === 'admin')
  const onStreak = streaks
    .filter((b) => b.bucket !== 'none')
    .reduce((n, b) => n + Number(b.members), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p className="page-sub">
            Who is in this ministry and the codes they joined with. What people write is
            not here and cannot be &mdash; the database gives an admin no way to read a
            reflection, and no way to see one member&rsquo;s streak either.
          </p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 14 }}>
        <div className="card kpi">
          <div className="kpi-label">Members</div>
          <div className="kpi-value">{members.length}</div>
          <div className="kpi-foot">
            {codes.reduce((n, c) => n + Number(c.uses), 0)} joins across{' '}
            {codes.length === 1 ? '1 code' : `${codes.length} codes`}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">On a streak today</div>
          <div className="kpi-value">{onStreak}</div>
          <div className="kpi-foot">
            {members.length ? `${Math.round((onStreak / members.length) * 100)}% of members` : '—'}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Reading language</div>
          <div style={{ margin: '6px 0 4px' }}>
            <SplitBar
              width={250}
              height={24}
              parts={[
                { value: amharic, color: SERIES[0], label: 'Amharic' },
                { value: english, color: SERIES[1], label: 'English' },
              ]}
            />
          </div>
          <div className="kpi-foot">
            <span lang="am">አማርኛ</span> {amharic} · English {english}
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Administrators</div>
          <div className="kpi-value">{admins.length}</div>
          <div className="kpi-foot">
            {admins.map((a) => a.display_name).join(' · ') || 'None'}
          </div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 14 }}>
        <div className="card-head">
          <h2 className="card-title">Join codes</h2>
          <span className="card-note">
            a code is how someone gets in &mdash; there is no open sign-up
          </span>
        </div>
        {codes.length === 0 ? (
          <div className="card-body">
            <p className="muted" style={{ margin: 0 }}>
              No join codes exist, so nobody new can get in.
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Used</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => {
                const used = Number(code.uses)
                const max = Number(code.max_uses) || 1
                const full = used >= max
                return (
                  <tr key={code.code}>
                    <td className="mono t-strong" style={{ fontSize: 13, letterSpacing: '.06em' }}>
                      {code.code}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="bar-track" style={{ width: 76 }}>
                          <div
                            className={`bar-fill${full ? ' crit' : ''}`}
                            style={{ width: `${Math.min((used / max) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: 11.5, color: full ? 'var(--crit)' : undefined }}>
                          {used} / {max}
                        </span>
                      </div>
                    </td>
                    <td className="faint">
                      {code.expires_at ? (
                        <>
                          {formatEthiopic(code.expires_at.slice(0, 10), 'en')}
                          <span className="mono"> · {code.expires_at.slice(0, 10)}</span>
                        </>
                      ) : (
                        'never'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="card-title">All members</h2>
          <span className="card-note">
            {shown.length === members.length ? members.length : `${shown.length} of ${members.length}`}
          </span>
          <div className="search" style={{ marginLeft: 'auto', width: 220 }}>
            <Icon name="search" size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a member…"
              aria-label="Find a member"
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                minHeight: 0,
                height: 20,
                fontSize: 12.5,
                boxShadow: 'none',
              }}
            />
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="card-body">
            <p className="muted" style={{ margin: 0 }}>
              {members.length === 0 ? 'Nobody has joined yet.' : 'No member matches that name.'}
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Joined</th>
                <th>Reads in</th>
                <th>Time of day</th>
                <th></th>
                <th className="r">Role</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="row" style={{ gap: 9 }}>
                      <span className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>
                        {member.display_name
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() ?? '')
                          .join('')}
                      </span>
                      <span className="t-strong">{member.display_name}</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12 }}>{formatEthiopic(member.joined_on, 'en')}</div>
                    <div className="faint mono" style={{ fontSize: 10.5 }}>
                      {member.joined_on}
                    </div>
                  </td>
                  <td>
                    <span className="pill">
                      {member.ui_language === 'am' ? <span lang="am">አማርኛ</span> : 'English'}
                    </span>
                  </td>
                  <td className="faint">{member.part_of_day}</td>
                  <td>
                    <button
                      className="small"
                      disabled={busy === member.id}
                      onClick={() => void openSendCode(member)}
                    >
                      Send code
                    </button>
                  </td>
                  <td className="r">
                    {/* An admin cannot demote themselves into losing the dashboard. */}
                    {member.id === profile?.id ? (
                      <span className="pill" style={{ borderStyle: 'dashed' }}>
                        You
                      </span>
                    ) : (
                      <select
                        value={member.role}
                        disabled={busy === member.id}
                        onChange={(e) => void setRole(member, e.target.value as 'user' | 'admin')}
                        style={{ width: 'auto', display: 'inline-block' }}
                      >
                        <option value="user">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {sendingTo && phoneError && (
        <Modal title="Send join code" onClose={() => setSendingTo(null)}>
          <p className="problem" style={{ margin: 0 }}>{phoneError}</p>
        </Modal>
      )}

      {sendingTo && sendPhone && (
        <SendCodeModal
          phone={sendPhone}
          available={sendCodes}
          onClose={() => setSendingTo(null)}
          onSent={() => {
            push('success', `Code sent to ${sendingTo.display_name}.`)
            setSendingTo(null)
          }}
        />
      )}
    </>
  )
}
