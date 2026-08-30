import { beforeEach, describe, expect, it } from 'vitest'
import { SCHEMA } from '../src/db/schema'
import { BOOKS_SQL, LIBRARY_DAYS_SQL } from '../src/data/queries'

/**
 * The app's own schema and queries, run against a plain SQLite.
 *
 * This exists because of a Phase 3 bug: a pull advanced the sync cursor without
 * storing its rows, and nothing caught it. Every test in the repo covered the
 * server contract, which was correct; the client's SQL was unreachable outside a
 * device and so was never exercised at all. These are the same strings the app
 * runs — not a re-creation, which would drift.
 */

// Node's own accessor, rather than an import: the bundler running these tests does
// not recognise `node:sqlite` as a builtin and tries to resolve it from disk.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite')

let db: InstanceType<typeof DatabaseSync>

const exec = (sql: string) => db.exec(sql)

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  // WAL is meaningless in memory and node:sqlite rejects the pragma's result set.
  exec(SCHEMA.replace('pragma journal_mode = WAL;', ''))
})

const insertDay = (over: Partial<Record<string, string | number>> = {}) => {
  const day = {
    id: 'd1', book_id: 'b1', day_number: 1, kind: 'devotion',
    topic_en: 'Decision', topic_am: 'ውሳኔ', purpose_en: 'p', purpose_am: 'ፐ',
    prayer_en: '', prayer_am: '', passage: null, key_verses: '[]', cross_refs: '[]',
    expected_seconds: 90, scheduled_date: '2026-08-01', updated_at: '2026-08-01',
    ...over,
  }
  db.prepare(
    `insert into devotion_days (id, book_id, day_number, kind, topic_en, topic_am,
       purpose_en, purpose_am, prayer_en, prayer_am, passage, key_verses, cross_refs,
       expected_seconds, scheduled_date, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    day.id as string, day.book_id as string, day.day_number as number, day.kind as string,
    day.topic_en as string, day.topic_am as string, day.purpose_en as string,
    day.purpose_am as string, day.prayer_en as string, day.prayer_am as string,
    day.passage as null, day.key_verses as string, day.cross_refs as string,
    day.expected_seconds as number, day.scheduled_date as string, day.updated_at as string,
  )
}

const insertBook = (id = 'b1', sequence = 1) =>
  db.prepare(
    `insert into books (id, round_id, sequence, source_id, title_en, title_am, status)
     values (?, 'r1', ?, 'BOOK', 'Ruth', 'ሩት', 'published')`,
  ).run(id, sequence)

describe('the schema applies', () => {
  it('creates every table the app reads', () => {
    const names = db
      .prepare(`select name from sqlite_master where type = 'table' order by name`)
      .all()
      .map((r) => (r as { name: string }).name)

    expect(names).toEqual(
      expect.arrayContaining([
        'books', 'day_completions', 'devotion_days', 'favorites', 'meta',
        'outbox', 'reflections', 'rounds', 'summary_questions',
      ]),
    )
  })

  it('keys reflections by day *and* question, so answers do not overwrite each other', () => {
    const insert = db.prepare(
      `insert into reflections (devotion_day_id, question_ordinal, body, updated_at)
       values (?, ?, ?, ?)`,
    )
    insert.run('d1', 1, 'answer one', 'now')
    insert.run('d1', 2, 'answer two', 'now')

    const rows = db.prepare('select body from reflections order by question_ordinal').all()
    expect(rows.map((r) => (r as { body: string }).body)).toEqual(['answer one', 'answer two'])
  })

  it('enforces one outbox row per client id, which is what makes retries safe', () => {
    const insert = db.prepare(
      `insert into outbox (client_id, entity, payload, local_created_at)
       values (?, 'completion', '{}', 'now')`,
    )
    insert.run('same-id')
    expect(() => insert.run('same-id')).toThrow(/UNIQUE/i)
  })
})

describe('the library query', () => {
  it('returns a day even when its book row is missing', () => {
    // The Phase 3 shape of this query inner-joined books, so a day whose parent had
    // not arrived yet vanished from the library entirely.
    insertDay()
    const rows = db.prepare(LIBRARY_DAYS_SQL).all()
    expect(rows).toHaveLength(1)
  })

  it('reports the three flags the filters depend on', () => {
    insertBook()
    insertDay()
    db.prepare(
      `insert into day_completions (devotion_day_id, method, counted_for_streak)
       values ('d1', 'live', 1)`,
    ).run()
    db.prepare(
      `insert into reflections (devotion_day_id, question_ordinal, body, updated_at)
       values ('d1', 0, 'something', 'now')`,
    ).run()
    db.prepare(`insert into favorites (devotion_day_id) values ('d1')`).run()

    const row = db.prepare(LIBRARY_DAYS_SQL).get() as Record<string, number>
    expect(row.completed).toBe(1)
    expect(row.reflected).toBe(1)
    expect(row.favourite).toBe(1)
  })

  it('does not count an empty reflection as reflected', () => {
    insertDay()
    db.prepare(
      `insert into reflections (devotion_day_id, question_ordinal, body, updated_at)
       values ('d1', 0, '   ', 'now')`,
    ).run()
    const row = db.prepare(LIBRARY_DAYS_SQL).get() as Record<string, number>
    expect(row.reflected).toBe(0)
  })

  it('orders newest first', () => {
    insertDay({ id: 'old', scheduled_date: '2026-07-01' })
    insertDay({ id: 'new', day_number: 2, scheduled_date: '2026-09-01' })
    const rows = db.prepare(LIBRARY_DAYS_SQL).all() as Array<{ id: string }>
    expect(rows.map((r) => r.id)).toEqual(['new', 'old'])
  })
})

describe('the book listing', () => {
  it('hides a book that has no visible day', () => {
    insertBook('with-days', 1)
    insertBook('empty', 2)
    insertDay({ book_id: 'with-days' })

    const rows = db.prepare(BOOKS_SQL).all() as Array<{ id: string }>
    expect(rows.map((r) => r.id)).toEqual(['with-days'])
  })
})
