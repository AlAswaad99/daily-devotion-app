import initSqlJs, { type Database } from 'sql.js'
import { Asset } from 'expo-asset'
import { Linking } from 'react-native'
import { BOOKS } from '@abide/content'
import { foldForSearch } from '@abide/domain'
import { log } from './log'

/**
 * The web twin of `scripture.ts`. Same bundled `bible.db`, same read-only/never-synced
 * contract, but opened with `sql.js` (WASM sqlite) instead of `expo-sqlite`, which has
 * no web backend for a plain read-only file like this one.
 *
 * The WASM binary is served as a static file from `public/sql-wasm.wasm` rather than
 * fetched from a CDN, so the reader doesn't depend on a third party being up.
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

type BindValue = string | number | Uint8Array | null

function queryAll<T>(db: Database, sql: string, params: BindValue[] = []): T[] {
  const stmt = db.prepare(sql)
  try {
    stmt.bind(params)
    const rows: T[] = []
    while (stmt.step()) rows.push(stmt.getAsObject() as T)
    return rows
  } finally {
    stmt.free()
  }
}

function queryFirst<T>(db: Database, sql: string, params: BindValue[] = []): T | null {
  return queryAll<T>(db, sql, params)[0] ?? null
}

let opening: Promise<Database | null> | null = null

/**
 * Fetch the bundled asset's bytes and hand them to sql.js. Memoises the *promise*,
 * matching the native version, so concurrent callers share one open rather than
 * decoding an 18 MB file twice.
 */
async function open(): Promise<Database | null> {
  try {
    const asset = Asset.fromModule(require('../../assets/bible/bible.db'))
    await asset.downloadAsync()
    const uri = asset.localUri ?? asset.uri
    if (!uri) {
      log.info('scripture', 'the scripture asset has no uri; reader unavailable')
      return null
    }

    const [SQL, response] = await Promise.all([
      initSqlJs({ locateFile: (file: string) => `/${file}` }),
      fetch(uri),
    ])
    const bytes = new Uint8Array(await response.arrayBuffer())
    const db = new SQL.Database(bytes)

    const count = queryFirst<{ n: number }>(db, 'select count(*) as n from translations')
    log.info('scripture', `opened with ${count?.n ?? 0} translation(s)`)
    return db
  } catch (error) {
    log.info('scripture', 'could not open the scripture database', {
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function scripture(): Promise<Database | null> {
  if (!opening) opening = open()
  return opening
}

export async function listTranslations(): Promise<Translation[]> {
  const db = await scripture()
  if (!db) return []
  return queryAll<Translation>(
    db,
    'select code, name, language, copyright from translations order by language',
  )
}

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
  return queryAll<Verse>(
    db,
    'select verse, text from verses where code = ? and book = ? and chapter = ? order by verse',
    [code, book, chapter],
  )
}

export async function chapterCount(code: string, book: number): Promise<number> {
  const db = await scripture()
  if (!db) return 0
  const row = queryFirst<{ n: number | null }>(
    db,
    'select max(chapter) as n from verses where code = ? and book = ?',
    [code, book],
  )
  return row?.n ?? 0
}

export async function searchVerses(
  code: string,
  query: string,
  limit = 60,
): Promise<SearchHit[]> {
  const db = await scripture()
  const needle = foldForSearch(query).trim()
  if (!db || needle.length < 2) return []

  return queryAll<SearchHit>(
    db,
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

  const version = language === 'am' ? '1260' : '111'
  const reference = `${code}.${chapter}${verse ? `.${verse}` : ''}`
  const url = `https://www.bible.com/bible/${version}/${reference}`

  log.info('scripture', `opening ${reference} externally`)
  await Linking.openURL(url).catch((error) =>
    log.info('scripture', 'could not open the external reader', { message: String(error) }),
  )
}
