import { createClient } from './supabase-browser'

/** One browser client for the whole dashboard. */
export const db = createClient()

export type ContentStatus = 'draft' | 'in_review' | 'published' | 'archived'

/**
 * Every status transition is recorded with who made it, because the review flow is
 * the thing standing between a typo and 200 people reading it. `content_revisions`
 * is written under the admin's own session, so the author is never in doubt.
 */
export async function recordRevision(input: {
  churchId: string
  entityType: 'book' | 'devotion_day' | 'round'
  entityId: string
  status: ContentStatus
  authorId: string
  payload?: Record<string, unknown>
}): Promise<void> {
  await db.from('content_revisions').insert({
    church_id: input.churchId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    payload: input.payload ?? {},
    author_id: input.authorId,
    status: input.status,
    ...(input.status === 'published' ? { published_at: new Date().toISOString() } : {}),
  })
}
