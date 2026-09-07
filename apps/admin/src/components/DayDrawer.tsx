'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatEthiopic } from '@abide/domain'
import { db } from '../lib/db'
import { Icon } from './Icon'
import { roundHex } from '../lib/round-colours'

export interface DrawerTarget {
  /** The date the cell stands for, whether or not anything is scheduled on it. */
  iso: string
  dayId: string | null
  bookTitle?: string | undefined
  roundLabel?: string | undefined
  roundColour?: string | undefined
}

interface DayDetail {
  id: string
  day_number: number
  kind: 'devotion' | 'summary'
  topic_en: string
  topic_am: string
  purpose_en: string
  purpose_am: string
  prayer_en: string
  prayer_am: string
  cross_refs: unknown[]
  cross_refs_raw: string | null
  expected_seconds: number
  status: string
}

/**
 * A day, read without leaving the calendar.
 *
 * The drawer exists so an admin can click along a week checking what is actually
 * scheduled — the previous flow sent them to a full editor page and back for every
 * day, which made comparing two days a four-navigation job.
 *
 * It reads; it does not write. Editing stays on the day's own page, because a
 * half-width panel is the wrong place to be editing bilingual prose.
 */
export function DayDrawer({
  target,
  onClose,
}: {
  target: DrawerTarget
  onClose: () => void
}) {
  /*
   * What was fetched, tagged with the day it belongs to.
   *
   * Kept as one value rather than a `day` plus a `loading` flag so that both can be
   * DERIVED from the target: clicking a second date makes the stale result
   * mismatch immediately, with no effect needed to blank it out first. An empty
   * date needs no fetch and therefore no state change at all.
   */
  const [loaded, setLoaded] = useState<{ id: string; day: DayDetail | null } | null>(null)

  useEffect(() => {
    const id = target.dayId
    if (!id) return
    let cancelled = false
    void (async () => {
      const { data } = await db
        .from('devotion_days')
        .select(
          'id, day_number, kind, topic_en, topic_am, purpose_en, purpose_am, prayer_en, prayer_am, cross_refs, cross_refs_raw, expected_seconds, status',
        )
        .eq('id', id)
        .maybeSingle()
      if (!cancelled) setLoaded({ id, day: (data as DayDetail | null) ?? null })
    })()
    return () => {
      cancelled = true
    }
  }, [target.dayId])

  const fresh = target.dayId != null && loaded?.id === target.dayId
  const day = fresh ? loaded!.day : null
  const loading = target.dayId != null && !fresh

  // Escape closes, which is the only way out that does not need a mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <button className="drawer-scrim" onClick={onClose} aria-label="Close preview" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Day preview">
        <div className="drawer-head">
          {target.roundColour && (
            <span
              className="round-chip"
              style={{ background: roundHex(target.roundColour), marginTop: 4, marginRight: 0 }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
              {formatEthiopic(target.iso, 'en')}
            </div>
            <div className="faint mono" style={{ fontSize: 11.5 }}>
              {target.iso}
              {target.roundLabel ? ` · ${target.roundLabel}` : ''}
            </div>
          </div>
          <button className="icon" onClick={onClose} aria-label="Close">
            <Icon name="close" size={15} />
          </button>
        </div>

        <div className="drawer-body">
          {!target.dayId ? (
            <div className="drawer-section">
              <p className="muted" style={{ marginBottom: 12 }}>
                Nothing is scheduled on this date. Members opening the app today would see
                &ldquo;coming soon&rdquo; rather than a devotion.
              </p>
              <Link href="/books" className="button">
                <Icon name="library" size={14} /> Open the library
              </Link>
            </div>
          ) : loading ? (
            <p className="muted">Loading…</p>
          ) : !day ? (
            <p className="problem">That day could not be loaded.</p>
          ) : (
            <>
              <div className="drawer-section">
                <div className="row" style={{ gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span className="pill">
                    {day.kind === 'summary' ? '★ Summary' : `Day ${day.day_number}`}
                  </span>
                  <span className={`pill ${day.status}`}>{day.status.replace('_', ' ')}</span>
                  <span className="faint mono" style={{ fontSize: 11 }}>
                    ~{Math.round(day.expected_seconds / 60)} min read
                  </span>
                </div>
                {target.bookTitle && (
                  <div className="faint" style={{ fontSize: 12 }}>
                    {target.bookTitle}
                  </div>
                )}
              </div>

              <Field label="Topic" en={day.topic_en} am={day.topic_am} strong />
              {day.kind !== 'summary' && (
                <Field label="Purpose" en={day.purpose_en} am={day.purpose_am} />
              )}
              <Field label="Prayer" en={day.prayer_en} am={day.prayer_am} />

              <div className="drawer-section">
                <h4>Scripture</h4>
                {/* A written reference that parsed to nothing is the one thing on this
                    panel an admin has to act on, so it is called out rather than blank. */}
                {Array.isArray(day.cross_refs) && day.cross_refs.length > 0 ? (
                  <p className="mono" style={{ fontSize: 12 }}>
                    {day.cross_refs.length} reference
                    {day.cross_refs.length === 1 ? '' : 's'} parsed
                  </p>
                ) : day.cross_refs_raw?.trim() ? (
                  <p className="problem" style={{ fontSize: 12.5 }}>
                    “{day.cross_refs_raw}” did not parse to any reference.
                  </p>
                ) : (
                  <p className="faint" style={{ fontSize: 12.5 }}>
                    No cross-references on this day.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {day && (
          <div className="drawer-foot">
            <Link href={`/days/${day.id}`} className="button primary">
              Edit this day
            </Link>
            <span className="faint" style={{ fontSize: 11.5 }}>
              Editing opens the full page
            </span>
          </div>
        )}
      </aside>
    </>
  )
}

function Field({
  label,
  en,
  am,
  strong,
}: {
  label: string
  en: string
  am: string
  strong?: boolean
}) {
  if (!en?.trim() && !am?.trim()) {
    return (
      <div className="drawer-section">
        <h4>{label}</h4>
        <p className="problem" style={{ fontSize: 12.5 }}>
          Missing in both languages.
        </p>
      </div>
    )
  }
  const style = strong ? { fontWeight: 600, color: 'var(--ink)' } : undefined
  return (
    <div className="drawer-section">
      <h4>{label}</h4>
      {en?.trim() ? (
        <p style={style}>{en}</p>
      ) : (
        <p className="problem" style={{ fontSize: 12.5 }}>
          No English yet.
        </p>
      )}
      <div className="drawer-am">
        {am?.trim() ? (
          <p lang="am" style={style}>
            {am}
          </p>
        ) : (
          <p className="problem" style={{ fontSize: 12.5 }}>
            No Amharic yet &mdash; this day is invisible to members reading in Amharic.
          </p>
        )}
      </div>
    </div>
  )
}
