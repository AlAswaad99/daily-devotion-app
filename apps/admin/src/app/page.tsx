'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../lib/db'
import { RequireAdmin } from '../components/RequireAdmin'

interface Engagement {
  scheduled_date: string
  completions: number
  reflections_written: number
}

export default function Overview() {
  return (
    <RequireAdmin>
      <OverviewInner />
    </RequireAdmin>
  )
}

function OverviewInner() {
  const [rows, setRows] = useState<Engagement[]>([])
  const [members, setMembers] = useState(0)

  const load = useCallback(async () => {
    const to = new Date().toISOString().slice(0, 10)
    const from = new Date(Date.now() - 13 * 86_400_000).toISOString().slice(0, 10)

    const [{ data: engagement }, { count }] = await Promise.all([
      // Counts only. This function cannot return a reflection body — there is no
      // column in its return type that could carry one.
      db.rpc('ministry_engagement', { p_from: from, p_to: to }),
      db.from('profiles').select('id', { count: 'exact', head: true }),
    ])

    return {
      rows: (engagement as Engagement[] | null) ?? [],
      members: count ?? 0,
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const data = await load()
      if (!cancelled) {
        setRows(data.rows)
        setMembers(data.members)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const peak = Math.max(1, ...rows.map((r) => Number(r.completions)))

  return (
    <>
      <h2>Overview</h2>
      <p className="sub">The last two weeks.</p>

      <div className="row" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="muted" style={{ fontSize: '.78rem' }}>Members</div>
          <strong style={{ fontSize: '1.8rem' }}>{members}</strong>
        </div>
      </div>

      <h3>Completions per day</h3>
      {rows.length === 0 ? (
        <p className="muted">
          Nothing yet. <Link href="/import">Import a round</Link> to get started.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Read</th>
              <th style={{ width: '50%' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.scheduled_date}>
                <td className="mono">{row.scheduled_date}</td>
                <td>{row.completions}</td>
                <td>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 5,
                      background: 'var(--accent)',
                      width: `${(Number(row.completions) / peak) * 100}%`,
                      minWidth: Number(row.completions) > 0 ? 6 : 0,
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: '1.5rem', fontSize: '.85rem' }}>
        Engagement is reported as counts through a function that has no way to return
        what anyone wrote. Reflections are readable only by their author, enforced by
        the database rather than by this page.
      </p>
    </>
  )
}
