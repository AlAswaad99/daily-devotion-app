import { db, recordRevision } from './db'

/**
 * Archiving is the only way to retire a round or book — the database refuses to
 * delete either once published (see `block_unsafe_round_delete` /
 * `block_unsafe_book_delete`), and a delete button that always fails is worse than
 * no button. Archiving cascades to every book and day underneath, so status never
 * disagrees between a round and its children, and a re-import that matches an
 * archived round's phase/round code can revive it cleanly.
 *
 * The "(Archived)" suffix is a dashboard-only marker — archived content is never
 * served to the mobile app, RLS only ever surfaces `published` rows — so it exists
 * purely so an admin scanning the Active list never mistakes a live-looking title
 * for one that's retired.
 */
const SUFFIX = ' (Archived)'
const withSuffix = (title: string): string => (title.endsWith(SUFFIX) ? title : `${title}${SUFFIX}`)
const withoutSuffix = (title: string): string =>
  title.endsWith(SUFFIX) ? title.slice(0, -SUFFIX.length) : title

const explain = (error: { message: string } | null): string | null =>
  error ? error.message.replace(/^.*?:\s*/, '') : null

export async function archiveRound(
  round: { id: string; church_id: string },
  authorId: string,
): Promise<string | null> {
  const { data: books, error: booksError } = await db
    .from('books')
    .select('id, title_en, title_am')
    .eq('round_id', round.id)
  if (booksError) return explain(booksError)

  const rows = (books as Array<{ id: string; title_en: string; title_am: string }> | null) ?? []
  for (const book of rows) {
    const { error } = await db
      .from('books')
      .update({ title_en: withSuffix(book.title_en), title_am: withSuffix(book.title_am) })
      .eq('id', book.id)
    if (error) return explain(error)
  }

  const bookIds = rows.map((b) => b.id)
  if (bookIds.length) {
    const { error: bookStatusError } = await db
      .from('books')
      .update({ status: 'archived' })
      .in('id', bookIds)
    if (bookStatusError) return explain(bookStatusError)

    const { error: dayError } = await db
      .from('devotion_days')
      .update({ status: 'archived' })
      .in('book_id', bookIds)
    if (dayError) return explain(dayError)
  }

  const { error } = await db.from('rounds').update({ status: 'archived' }).eq('id', round.id)
  if (error) return explain(error)

  await recordRevision({
    churchId: round.church_id,
    entityType: 'round',
    entityId: round.id,
    status: 'archived',
    authorId,
  })
  return null
}

export async function restoreRound(
  round: { id: string; church_id: string },
  authorId: string,
): Promise<string | null> {
  const { data: books, error: booksError } = await db
    .from('books')
    .select('id, title_en, title_am')
    .eq('round_id', round.id)
  if (booksError) return explain(booksError)

  const rows = (books as Array<{ id: string; title_en: string; title_am: string }> | null) ?? []
  for (const book of rows) {
    const { error } = await db
      .from('books')
      .update({ title_en: withoutSuffix(book.title_en), title_am: withoutSuffix(book.title_am) })
      .eq('id', book.id)
    if (error) return explain(error)
  }

  const bookIds = rows.map((b) => b.id)
  if (bookIds.length) {
    const { error: bookStatusError } = await db
      .from('books')
      .update({ status: 'draft' })
      .in('id', bookIds)
    if (bookStatusError) return explain(bookStatusError)

    const { error: dayError } = await db
      .from('devotion_days')
      .update({ status: 'draft' })
      .in('book_id', bookIds)
    if (dayError) return explain(dayError)
  }

  const { error } = await db.from('rounds').update({ status: 'draft' }).eq('id', round.id)
  if (error) return explain(error)

  await recordRevision({
    churchId: round.church_id,
    entityType: 'round',
    entityId: round.id,
    status: 'draft',
    authorId,
  })
  return null
}

export async function archiveBook(
  book: { id: string; church_id: string; title_en: string; title_am: string },
  authorId: string,
): Promise<string | null> {
  const { error } = await db
    .from('books')
    .update({ status: 'archived', title_en: withSuffix(book.title_en), title_am: withSuffix(book.title_am) })
    .eq('id', book.id)
  if (error) return explain(error)

  const { error: dayError } = await db
    .from('devotion_days')
    .update({ status: 'archived' })
    .eq('book_id', book.id)
  if (dayError) return explain(dayError)

  await recordRevision({
    churchId: book.church_id,
    entityType: 'book',
    entityId: book.id,
    status: 'archived',
    authorId,
  })
  return null
}

export async function restoreBook(
  book: { id: string; church_id: string; title_en: string; title_am: string },
  authorId: string,
): Promise<string | null> {
  const { error } = await db
    .from('books')
    .update({ status: 'draft', title_en: withoutSuffix(book.title_en), title_am: withoutSuffix(book.title_am) })
    .eq('id', book.id)
  if (error) return explain(error)

  const { error: dayError } = await db
    .from('devotion_days')
    .update({ status: 'draft' })
    .eq('book_id', book.id)
  if (dayError) return explain(dayError)

  await recordRevision({
    churchId: book.church_id,
    entityType: 'book',
    entityId: book.id,
    status: 'draft',
    authorId,
  })
  return null
}
