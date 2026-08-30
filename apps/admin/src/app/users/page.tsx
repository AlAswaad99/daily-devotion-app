'use client'

import { useCallback, useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db } from '../../lib/db'
import { useSession } from '../../lib/session'
import { RequireAdmin } from '../../components/RequireAdmin'

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
}

async function fetchMembers(): Promise<{ members: Member[]; codes: JoinCode[] }> {
  const [{ data: m }, { data: c }] = await Promise.all([
    db
      .from('profiles')
      .select('id, display_name, role, ui_language, part_of_day, joined_on')
      .order('joined_on'),
    db.from('join_codes').select('code, max_uses, uses, expires_at'),
  ])
  return {
    members: (m as Member[] | null) ?? [],
    codes: (c as JoinCode[] | null) ?? [],
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
  const [members, setMembers] = useState<Member[]>([])
  const [codes, setCodes] = useState<JoinCode[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  // Fetchers return data; effects set state. Keeping those separate is what lets
  // the same function serve both the initial load and a refresh after an edit.
  const load = useCallback(async () => {
    const rows = await fetchMembers()
    setMembers(rows.members)
    setCodes(rows.codes)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const rows = await fetchMembers()
      if (!cancelled) {
        setMembers(rows.members)
        setCodes(rows.codes)
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
    if (error) window.alert(error.message)
    await load()
    setBusy(null)
  }

  return (
    <>
      <h2>Users</h2>
      <p className="sub">
        Members of this ministry, and the codes they join with. What people write is
        not here and cannot be — the database gives admins no way to read reflections.
      </p>

      <h3>Join codes</h3>
      <table style={{ marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th>Code</th>
            <th>Used</th>
            <th>Expires</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((code) => (
            <tr key={code.code}>
              <td className="mono">{code.code}</td>
              <td>
                {code.uses} / {code.max_uses}
              </td>
              <td className="muted">{code.expires_at ?? 'never'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Members ({members.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Joined</th>
            <th>Language</th>
            <th>Reads</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.id}>
              <td>{member.display_name}</td>
              <td>
                {formatEthiopic(member.joined_on, 'en')}
                <div className="muted mono" style={{ fontSize: '.75rem' }}>
                  {member.joined_on}
                </div>
              </td>
              <td className="muted">{member.ui_language}</td>
              <td className="muted">{member.part_of_day}</td>
              <td>
                {/* An admin cannot demote themselves into losing the dashboard. */}
                {member.id === profile?.id ? (
                  <span className="pill">you</span>
                ) : (
                  <select
                    value={member.role}
                    disabled={busy === member.id}
                    onChange={(e) => void setRole(member, e.target.value as 'user' | 'admin')}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
