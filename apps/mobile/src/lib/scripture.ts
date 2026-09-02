import { Asset } from 'expo-asset'
import { Directory, File, Paths } from 'expo-file-system'
import * as SQLite from 'expo-sqlite'
import { Linking } from 'react-native'
import { BOOKS } from '@abide/content'
import { foldForSearch } from '@abide/domain'
import { log } from './log'

/**
 * The bundled scripture text.
 *
 * Read-only and separate from the app's own database on purpose: it never changes,
 * it is never synced, and it is the one large asset. Keeping it apart means a
 * migration of the app's schema cannot touch it and a reinstall of the text cannot
 * lose a reflection.
 *
 * **Nothing here names a translation.** Which text a member reads is a row in the
 * database, chosen by their reader language, and the database may legitimately be
 * empty — that is the state until Biblica grants permission. Every function is
 * written so that "no text bundled" is an ordinary answer rather than a failure, and
 * the reader offers `openExternally` instead.
 */

export interface Translation {
  code: string
  name: string
  language: string
  copyright: string
}

export interface Verse {
  verse: number
  text: string
}

export interface SearchHit {
  book: number
  chapter: number
  verse: number
  text: string
}

let opening: Promise<SQLite.SQLiteDatabase | null> | null = null

/**
 * Copy the asset out and open it.
 *
 * SQLite needs a real file it can seek in; a bundled asset is not one. The copy is
 * done once and skipped if the file is already there, since it is 17 MB and doing it
 * on every launch would be felt.
 *
 * Memoises the *promise*, not the handle — the same bug that opened two connections
 * to the app database in Phase 3.
 */
async function open(): Promise<SQLite.SQLiteDatabase | null> {
  try {
    const directory = new Directory(Paths.document, 'SQLite')
    if (!directory.exists) directory.create({ intermediates: true })

    const destination = new File(directory, 'bible.db')

    /*
     * Size, not existence.
     *
     * An interrupted copy — or anything else that creates the path without filling
     * it — leaves a file that `exists` happily reports, and every launch afterwards
     * skips the copy and opens an empty database. The reader then fails with "no
     * such table" for ever, which is a permanent break caused by one bad first run.
     * A byte count is the cheap way to tell a real database from a placeholder.
     */
    const usable = destination.exists && (destination.size ?? 0) > 4096

    if (!usable) {
      if (destination.exists) {
        log.info('scripture', 'the copied database is empty or truncated; copying again')
        destination.delete()
      }

      const asset = Asset.fromModule(require('../../assets/bible/bible.db'))
      await asset.downloadAsync()
      if (!asset.localUri) {
        log.info('scripture', 'the scripture asset has no local uri; reader unavailable')
        return null
      }
      log.info('scripture', 'copying the scripture database into place')
      new File(asset.localUri).copy(destination)
    }

    const db = await SQLite.openDatabaseAsync('bible.db')
    const count = await db.getFirstAsync<{ n: number }>('select count(*) as n from translations')
    log.info('scripture', `opened with ${count?.n ?? 0} translation(s)`)
    return db
  } catch (error) {
    // A missing or unreadable text is not a crash. The reader falls back to opening
    // the passage elsewhere, which is the shipping behaviour until gate 1 clears.
    log.info('scripture', 'could not open the scripture database', {
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function scripture(): Promise<SQLite.SQLiteDatabase | null> {
  if (!opening) opening = open()
  return opening
}

export async function listTranslations(): Promise<Translation[]> {
  const db = await scripture()
  if (!db) return []
  return db.getAllAsync<Translation>(
    'select code, name, language, copyright from translations order by language',
  )
}

/**
 * The text for a reader language, or null when none is bundled for it.
 *
 * Deliberately does **not** fall back to another language. Handing an Amharic reader
 * an English text is not a smaller version of the right answer — it is the wrong
 * text, under book names in their own language, which reads as a bug. The spec is
 * explicit that the Amharic side falls back to deep-linking out instead, and null is
 * how the reader is told to offer that.
 */
export async function translationFor(language: string): Promise<Translation | null> {
  const all = await listTranslations()
  return all.find((t) => t.language === language) ?? null
}

export async function chapterVerses(
  code: string,
  book: number,
  chapter: number,
): Promise<Verse[]> {
  const db = await scripture()
  if (!db) return []
  return db.getAllAsync<Verse>(
    'select verse, text from verses where code = ? and book = ? and chapter = ? order by verse',
    [code, book, chapter],
  )
}

/** How many chapters a book has in this translation — for the prev/next bounds. */
export async function chapterCount(code: string, book: number): Promise<number> {
  const db = await scripture()
  if (!db) return 0
  const row = await db.getFirstAsync<{ n: number | null }>(
    'select max(chapter) as n from verses where code = ? and book = ?',
    [code, book],
  )
  return row?.n ?? 0
}

/**
 * Search, folded so Ethiopic variants find each other.
 *
 * The query is folded with the same function that folded the index at build time,
 * which is the only reason ሠ finds ሰ. `folded` is null wherever it would merely have
 * been `lower(text)`, so the comparison coalesces rather than branching.
 *
 * A scan, not an index: a leading wildcard cannot use one. Limited, and over roughly
 * 31,000 short rows for a single translation, which is quick enough for a search
 * someone submits rather than one that runs on every keystroke.
 */
export async function searchVerses(
  code: string,
  query: string,
  limit = 60,
): Promise<SearchHit[]> {
  const db = await scripture()
  const needle = foldForSearch(query).trim()
  if (!db || needle.length < 2) return []

  return db.getAllAsync<SearchHit>(
    `select book, chapter, verse, text
       from verses
      where code = ?
        and coalesce(folded, lower(text)) like ?
      order by book, chapter, verse
      limit ?`,
    [code, `%${needle}%`, limit],
  )
}

export const bookName = (index: number, language: string): string => {
  const entry = BOOKS.find((b) => b.index === index)
  if (!entry) return String(index)
  return language === 'am' ? entry.am : entry.en
}

/**
 * Open a passage in YouVersion instead.
 *
 * This is the fallback the licensing gate requires, and it is not a degraded mode —
 * until permission lands it is what ships. YouVersion's scheme takes a USFM book
 * code, so the canonical index is mapped to one.
 */
const USFM = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI',
  '1CH', '2CH', 'EZR', 'NEH', 'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER',
  'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON', 'MIC', 'NAM', 'HAB', 'ZEP',
  'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
  'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE',
  '2PE', '1JN', '2JN', '3JN', 'JUD', 'REV',
]

export async function openExternally(
  book: number,
  chapter: number,
  verse: number | null,
  language: string,
): Promise<void> {
  const code = USFM[book - 1]
  if (!code) return

  // 1260 is the Amharic NASV on YouVersion; 111 is the NIV.
  const version = language === 'am' ? '1260' : '111'
  const reference = `${code}.${chapter}${verse ? `.${verse}` : ''}`
  const url = `https://www.bible.com/bible/${version}/${reference}`

  log.info('scripture', `opening ${reference} externally`)
  await Linking.openURL(url).catch((error) =>
    log.info('scripture', 'could not open the external reader', { message: String(error) }),
  )
}
