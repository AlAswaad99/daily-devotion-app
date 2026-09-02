/**
 * Phase 7's exit criterion: every validated reference in the seeded content resolves.
 *
 * The devotions carry references the ministry wrote, parsed in Phase 1 into
 * `{book, chapter, verseStart, verseEnd}`. Parsing them is not the same as being able
 * to *open* them — a reference can be well-formed and still point at a verse that
 * does not exist, and only the built scripture database can say which.
 *
 * Run it against a development build (`--include-licensed`), since that is the only
 * one with text in it today.
 *
 *   node scripts/check-bible-refs.mjs
 */
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BOOKS } from '../packages/content/src/lexicon-books.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BIBLE = path.join(repoRoot, 'apps', 'mobile', 'assets', 'bible', 'bible.db')

const BASE = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

if (!existsSync(BIBLE)) {
  console.error('No scripture database. Build one first:')
  console.error('    node scripts/build-bible.mjs --include-licensed')
  process.exit(1)
}

/*
 * The devotions are fetched before the scripture database is opened, not after.
 * Holding a node:sqlite handle open across an await leaves it alive while undici
 * tears its pool down, and the two teardowns race into a libuv assertion on Windows
 * — a crash printed after a perfectly good report, and a junk exit code with it.
 */
const response = await fetch(
  `${BASE}/rest/v1/devotion_days?select=day_number,topic_en,passage,key_verses,cross_refs,book_id`,
  { headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } },
)

if (!response.ok) {
  console.error(`Could not read the devotions: ${response.status}`)
  process.exit(1)
}

const days = await response.json()

const db = new DatabaseSync(BIBLE, { readOnly: true })
const translations = db.prepare('select code, language from translations').all()

if (translations.length === 0) {
  console.error('The scripture database has no translations in it.')
  process.exit(1)
}

const exists = db.prepare(
  'select count(*) as n from verses where code = ? and book = ? and chapter = ? and verse = ?',
)
const chapterLength = db.prepare(
  'select max(verse) as last from verses where code = ? and book = ? and chapter = ?',
)

const bookName = (index) => BOOKS.find((b) => b.index === index)?.en ?? `book ${index}`

const problems = []
let checked = 0

/** Does this reference point at text that is actually there? */
function resolve(ref, where, code) {
  if (!ref || typeof ref.book !== 'number' || !ref.chapter) return
  checked++

  const start = ref.verseStart ?? 1
  const found = exists.get(code, ref.book, ref.chapter, start)

  if (found.n === 0) {
    const last = chapterLength.get(code, ref.book, ref.chapter).last
    problems.push({
      where,
      raw: ref.raw,
      why:
        last === null
          ? `${bookName(ref.book)} has no chapter ${ref.chapter}`
          : `${bookName(ref.book)} ${ref.chapter} ends at verse ${last}, so :${start} is past the end`,
      code,
    })
    return
  }

  // A range that runs past the end of the chapter still opens, but it is a content
  // error worth surfacing rather than silently truncating in the reader.
  if (ref.verseEnd && !ref.chapterEnd) {
    const last = chapterLength.get(code, ref.book, ref.chapter).last
    if (ref.verseEnd > last) {
      problems.push({
        where,
        raw: ref.raw,
        why: `range ends at :${ref.verseEnd} but ${bookName(ref.book)} ${ref.chapter} ends at :${last}`,
        code,
      })
    }
  }
}

for (const day of days) {
  const label = `day ${day.day_number} (${day.topic_en || 'untitled'})`

  for (const { code } of translations) {
    resolve(day.passage, `${label} passage`, code)
    for (const ref of day.key_verses ?? []) resolve(ref, `${label} key verse`, code)
    for (const ref of day.cross_refs ?? []) resolve(ref, `${label} cross-ref`, code)
  }
}

console.log(
  `${days.length} day(s), ${checked} reference lookup(s) across ` +
    `${translations.map((t) => t.code).join(' + ')}`,
)

if (problems.length === 0) {
  console.log('\nEvery reference resolves.')
} else {
  console.log(`\n${problems.length} that do not resolve:\n`)
  for (const p of problems) {
    console.log(`  [${p.code}] ${p.where}`)
    console.log(`      "${p.raw}" — ${p.why}`)
  }
}

/*
 * Close the database, and set `exitCode` rather than calling `process.exit()`.
 * Exiting with a node:sqlite handle still open trips a libuv assertion on Windows,
 * which prints a crash after a perfectly good report and returns a junk status —
 * enough to fail CI for no reason.
 */
db.close()
process.exitCode = problems.length === 0 ? 0 : 1
