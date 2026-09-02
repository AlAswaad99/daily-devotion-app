/**
 * Scripture XML → the bundled read-only SQLite the reader opens.
 *
 * Translations are rows, not assumptions. That is the whole engineering mitigation
 * for licensing gate 1: the reader has no idea which text it is showing, so a
 * public-domain translation drops in without a code change if Biblica refuses, and
 * the Amharic side falls back to deep-linking out.
 *
 * That mitigation only works if the gate is mechanical rather than remembered, so
 * **only translations marked distributable are built by default.** Including the
 * Biblica texts takes an explicit flag, and the flag names what it is doing.
 *
 *   node scripts/build-bible.mjs                     what may be shipped
 *   node scripts/build-bible.mjs --include-licensed  plus © Biblica, for dev only
 *   node scripts/build-bible.mjs --list              what sources exist
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { foldForSearch } from '../packages/domain/src/library.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(repoRoot, 'apps', 'mobile', 'assets', 'bible', 'bible.db')

/**
 * Every text we know how to build, and whether it may leave this machine.
 *
 * `distributable: false` is not a note to the reader — it is enforced below. The NIV
 * and the Amharic NASV are © Biblica, Inc.; development proceeds against them and
 * distribution does not, until written permission lands.
 */
const SOURCES = [
  {
    code: 'niv',
    file: 'EnglishNIVBible.xml',
    name: 'New International Version',
    language: 'en',
    copyright: 'Holy Bible, New International Version® © Biblica, Inc.',
    distributable: false,
  },
  {
    code: 'nasv',
    file: 'AmharicNASVBible.xml',
    name: 'አዲሱ መደበኛ ትርጕም',
    language: 'am',
    copyright:
      'መጽሐፍ ቅዱስ፣ አዲሱ መደበኛ ትርጕም™ © 2001 Biblica, Inc. — New Amharic Standard Version™',
    distributable: false,
  },
  /*
   * When a public-domain text is added — WEB or KJV for English — it lands here with
   * `distributable: true` and nothing else changes. That is the point.
   */
]

const args = process.argv.slice(2)
const includeLicensed = args.includes('--include-licensed')

/*
 * `--only=niv` builds a single translation.
 *
 * For development on an emulator, where the asset is fetched from Metro over the
 * emulator bridge rather than read out of the APK: the full 18 MB build reliably
 * exceeds expo-asset's 60-second download timeout, so the reader can never be
 * exercised with real text. A release build reads the asset locally and is not
 * affected, so this is a testing affordance and not a product decision.
 */
const onlyCode = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null

if (args.includes('--list')) {
  for (const source of SOURCES) {
    const present = existsSync(path.join(repoRoot, 'bibles', source.file))
    console.log(
      `${source.code.padEnd(6)} ${source.language}  ` +
        `${source.distributable ? 'distributable' : 'LICENSED    '}  ` +
        `${present ? 'present' : 'missing'}  ${source.name}`,
    )
  }
  process.exit(0)
}

// ------------------------------------------------------------------- the parser
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

const decode = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => ENTITIES[name])

/**
 * Walk the file emitting verses.
 *
 * A scanning regex rather than an XML library: the format is a fixed three-level
 * nesting produced by one exporter, and the alternative is a dependency that would
 * parse 7 MB into a DOM to read it once.
 */
function* verses(xml) {
  const token = /<book number="(\d+)"|<chapter number="(\d+)"|<verse number="(\d+)"[^>]*>([\s\S]*?)<\/verse>/g
  let book = 0
  let chapter = 0

  for (const match of xml.matchAll(token)) {
    if (match[1] !== undefined) {
      book = Number(match[1])
      chapter = 0
    } else if (match[2] !== undefined) {
      chapter = Number(match[2])
    } else {
      const text = decode(match[4]).replace(/\s+/g, ' ').trim()
      if (text) yield { book, chapter, verse: Number(match[3]), text }
    }
  }
}

// -------------------------------------------------------------------- the build
const chosen = SOURCES.filter(
  (source) =>
    (source.distributable || includeLicensed) && (!onlyCode || source.code === onlyCode),
)
const licensed = chosen.filter((s) => !s.distributable)

/*
 * An empty database is still built when nothing may be shipped.
 *
 * The app bundles this file as an asset, so it has to exist for the bundle to
 * resolve at all — a missing asset is a build error, not a graceful fallback. With
 * no translations in it the reader finds none for the reader language and offers the
 * passage elsewhere, which is exactly what gate 1 calls for.
 */
if (chosen.length === 0) {
  console.log('No distributable translation is available yet — building an empty database.')
  console.log('The reader will fall back to deep-linking out, which is the intended')
  console.log('behaviour until Biblica grants permission.')
  console.log('\nFor a development build:  node scripts/build-bible.mjs --include-licensed\n')
}

mkdirSync(path.dirname(OUT), { recursive: true })
if (existsSync(OUT)) rmSync(OUT)

const db = new DatabaseSync(OUT)

db.exec(`
  create table translations (
    code          text primary key,
    name          text not null,
    language      text not null,
    copyright     text not null default '',
    distributable integer not null
  );

  create table verses (
    code    text not null,
    book    integer not null,
    chapter integer not null,
    verse   integer not null,
    text    text not null,
    /*
     * The search form, and null when it is merely lower(text).
     *
     * Folding is what keeps ሠ and ሰ finding each other, and it has to happen at
     * index time so search does not fold 31,000 rows on a phone. But for English
     * the fold *is* lowercasing, which SQLite does for free — storing it anyway
     * duplicated every verse and cost 7 MB of the 22 MB build. Queries read
     * coalesce(folded, lower(text)), so there is one expression, not a branch.
     */
    folded  text,
    primary key (code, book, chapter, verse)
  ) without rowid;

  create index verses_chapter on verses (code, book, chapter);
`)

const addTranslation = db.prepare(
  'insert into translations (code, name, language, copyright, distributable) values (?, ?, ?, ?, ?)',
)
const addVerse = db.prepare(
  'insert into verses (code, book, chapter, verse, text, folded) values (?, ?, ?, ?, ?, ?)',
)

for (const source of chosen) {
  const file = path.join(repoRoot, 'bibles', source.file)
  if (!existsSync(file)) {
    console.log(`${source.code}: ${source.file} is missing — skipped`)
    continue
  }

  const started = Date.now()
  const xml = readFileSync(file, 'utf8')

  addTranslation.run(
    source.code,
    source.name,
    source.language,
    source.copyright,
    source.distributable ? 1 : 0,
  )

  let count = 0
  db.exec('begin')
  for (const v of verses(xml)) {
    const folded = foldForSearch(v.text)
    addVerse.run(
      source.code,
      v.book,
      v.chapter,
      v.verse,
      v.text,
      folded === v.text.toLowerCase() ? null : folded,
    )
    count++
  }
  db.exec('commit')

  console.log(
    `${source.code.padEnd(6)} ${String(count).padStart(6)} verses  ` +
      `${((Date.now() - started) / 1000).toFixed(1)}s  ${source.name}`,
  )
}

db.exec('vacuum')
db.close()

const size = (readFileSync(OUT).length / 1024 / 1024).toFixed(1)
console.log(`\n${path.relative(repoRoot, OUT)}  ${size} MB`)

if (licensed.length > 0) {
  console.log(
    `\n⚠  Contains ${licensed.map((s) => s.code).join(', ')} — © Biblica, not licensed for ` +
      'distribution.\n   This build is for development only. Do not ship it or upload it to a store.',
  )
}
