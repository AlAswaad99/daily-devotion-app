import { getDatabase, getMeta, setMeta } from '../db/database'

/**
 * What the reader remembers.
 *
 * Highlights and bookmarks are stored against the canonical reference, not against a
 * translation, so a member who switches reader language keeps their marks. They are
 * device-local by design: the spec does not sync them, and unlike a reflection a
 * highlight is closer to a dog-ear than to something written.
 */

export async function listHighlights(book: number, chapter: number): Promise<number[]> {
  const db = await getDatabase()
  const rows = await db.getAllAsync<{ verse: number }>(
    'select verse from highlights where book = ? and chapter = ?',
    [book, chapter],
  )
  return rows.map((r) => r.verse)
}

export async function setHighlight(
  book: number,
  chapter: number,
  verse: number,
  on: boolean,
): Promise<void> {
  const db = await getDatabase()
  if (on) {
    await db.runAsync(
      'insert or ignore into highlights (book, chapter, verse) values (?, ?, ?)',
      [book, chapter, verse],
    )
  } else {
    await db.runAsync('delete from highlights where book = ? and chapter = ? and verse = ?', [
      book,
      chapter,
      verse,
    ])
  }
}

export async function isBookmarked(book: number, chapter: number): Promise<boolean> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ n: number }>(
    'select count(*) as n from bookmarks where book = ? and chapter = ?',
    [book, chapter],
  )
  return (row?.n ?? 0) > 0
}

/** Returns the state it left the chapter in, so the caller does not have to re-read. */
export async function toggleBookmark(book: number, chapter: number): Promise<boolean> {
  const db = await getDatabase()
  if (await isBookmarked(book, chapter)) {
    await db.runAsync('delete from bookmarks where book = ? and chapter = ?', [book, chapter])
    return false
  }
  await db.runAsync(
    'insert into bookmarks (book, chapter, created_at) values (?, ?, ?)',
    [book, chapter, new Date().toISOString()],
  )
  return true
}

export interface Bookmark {
  book: number
  chapter: number
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const db = await getDatabase()
  return db.getAllAsync<Bookmark>(
    'select book, chapter from bookmarks order by created_at desc',
  )
}

const FONT_KEY = 'reader.fontScale'

export async function readerFontScale(): Promise<number> {
  const stored = await getMeta(FONT_KEY)
  const value = stored === null ? 1 : Number(stored)
  // Clamped on read as well as write: a corrupted value must not make scripture
  // unreadable with no way back, since the control only cycles upward.
  return Number.isFinite(value) ? Math.min(Math.max(value, 0.9), 1.6) : 1
}

export async function setReaderFontScale(scale: number): Promise<void> {
  await setMeta(FONT_KEY, String(Math.min(Math.max(scale, 0.9), 1.6)))
}
