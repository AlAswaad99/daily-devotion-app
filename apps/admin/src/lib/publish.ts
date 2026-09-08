import { db, recordRevision } from './db'

/**
 * Publishing a book or round only ever updated that one row — the days
 * underneath, inserted as `draft` at import time, never moved. RLS requires a
 * day's own status to be `published`, not just its book's, so nothing a
 * publish click did ever actually reached the app; every day sat invisible
 * forever regardless of how many times its book was "published". These
 * mirror `archive.ts`'s cascade (archiving already got this right) for the
 * opposite direction.
 */

const explain = (error: { message: string } | null): string | null =>
  error ? error.message.replace(/^.*?:\s*/, '') : null

export async function publishBook(
  book: { id: string; church_id: string },
  authorId: string,
): Promise<string | null> {
  const { error: bookError } = await db.from('books').update({ status: 'published' }).eq('id', book.id)
  if (bookError) return explain(bookError)

  const { error: dayError } = await db
    .from('devotion_days')
    .update({ status: 'published' })
    .eq('book_id', book.id)
  if (dayError) return explain(dayError)

  await recordRevision({
    churchId: book.church_id,
    entityType: 'book',
    entityId: book.id,
    status: 'published',
    authorId,
  })
  return null
}

/**
 * A round publish is already a single, no-review-step click — unlike a book's
 * draft → in_review → published pair — so it reads as "this round is live
 * now", not "the books are live, days pending". Cascades all the way down to
 * match that. Already-archived books are left alone: a round publish isn't a
 * request to un-retire something an admin deliberately archived.
 */
export async function publishRound(
  round: { id: string; church_id: string },
  authorId: string,
): Promise<string | null> {
  const { data: books, error: booksError } = await db
    .from('books')
    .select('id')
    .eq('round_id', round.id)
    .neq('status', 'archived')
  if (booksError) return explain(booksError)

  const bookIds = ((books as Array<{ id: string }> | null) ?? []).map((b) => b.id)
  if (bookIds.length) {
    const { error: bookError } = await db.from('books').update({ status: 'published' }).in('id', bookIds)
    if (bookError) return explain(bookError)

    const { error: dayError } = await db
      .from('devotion_days')
      .update({ status: 'published' })
      .in('book_id', bookIds)
    if (dayError) return explain(dayError)
  }

  const { error } = await db.from('rounds').update({ status: 'published' }).eq('id', round.id)
  if (error) return explain(error)

  await recordRevision({
    churchId: round.church_id,
    entityType: 'round',
    entityId: round.id,
    status: 'published',
    authorId,
  })
  return null
}
