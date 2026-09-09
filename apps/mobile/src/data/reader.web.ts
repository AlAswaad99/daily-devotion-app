import { getMeta, setMeta } from '../db/database'

/**
 * The web twin of `reader.ts`. Highlights and bookmarks are device-local on native
 * too (never synced), so `localStorage` is a like-for-like substitute rather than a
 * downgrade.
 */

const HIGHLIGHTS_KEY = 'reader.highlights'
const BOOKMARKS_KEY = 'reader.bookmarks'

interface StoredHighlight {
  book: number
  chapter: number
  verse: number
}

interface StoredBookmark {
  book: number
  chapter: number
  created_at: string
}

async function readHighlights(): Promise<StoredHighlight[]> {
  const raw = await getMeta(HIGHLIGHTS_KEY)
  return raw ? (JSON.parse(raw) as StoredHighlight[]) : []
}

async function readBookmarks(): Promise<StoredBookmark[]> {
  const raw = await getMeta(BOOKMARKS_KEY)
  return raw ? (JSON.parse(raw) as StoredBookmark[]) : []
}

export async function listHighlights(book: number, chapter: number): Promise<number[]> {
  const all = await readHighlights()
  return all.filter((h) => h.book === book && h.chapter === chapter).map((h) => h.verse)
}

export async function setHighlight(
  book: number,
  chapter: number,
  verse: number,
  on: boolean,
): Promise<void> {
  const all = await readHighlights()
  const filtered = all.filter((h) => !(h.book === book && h.chapter === chapter && h.verse === verse))
  if (on) filtered.push({ book, chapter, verse })
  await setMeta(HIGHLIGHTS_KEY, JSON.stringify(filtered))
}

export async function isBookmarked(book: number, chapter: number): Promise<boolean> {
  const all = await readBookmarks()
  return all.some((b) => b.book === book && b.chapter === chapter)
}

export async function toggleBookmark(book: number, chapter: number): Promise<boolean> {
  const all = await readBookmarks()
  const on = all.some((b) => b.book === book && b.chapter === chapter)
  const next = on
    ? all.filter((b) => !(b.book === book && b.chapter === chapter))
    : [...all, { book, chapter, created_at: new Date().toISOString() }]
  await setMeta(BOOKMARKS_KEY, JSON.stringify(next))
  return !on
}

export interface Bookmark {
  book: number
  chapter: number
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const all = await readBookmarks()
  return [...all]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((b) => ({ book: b.book, chapter: b.chapter }))
}

const FONT_KEY = 'reader.fontScale'

export async function readerFontScale(): Promise<number> {
  const stored = await getMeta(FONT_KEY)
  const value = stored === null ? 1 : Number(stored)
  return Number.isFinite(value) ? Math.min(Math.max(value, 0.9), 1.6) : 1
}

export async function setReaderFontScale(scale: number): Promise<void> {
  await setMeta(FONT_KEY, String(Math.min(Math.max(scale, 0.9), 1.6)))
}
