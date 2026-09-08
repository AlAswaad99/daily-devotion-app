import { computeExpectedSeconds, type ScriptureRef } from '@abide/domain'
import { parseReferences, passageFromTopic, type ParseIssue } from './parse.ts'
import { validateRef, type ValidationIssue } from './validate.ts'

/** The shape the ministry's exported JSON actually has. */
export interface SourceBundle {
  devotional_metadata: {
    church: Localised
    ministry: Localised
    phase: string
    round: string
    main_verse: Localised
  }
  books: SourceBook[]
}

export interface Localised {
  am: string
  en: string
}

export interface SourceBook {
  book_id: string
  title: Localised
  daily_devotions: SourceDay[]
  summary_questions: Array<{ question_number: string; question: Localised }>
}

export interface SourceDay {
  day: number
  topic: Localised
  /** Absent on every Psalms day — the passage is inside `topic` there instead. */
  verses?: string
  purpose: Localised
  key_verses?: string
  cross_references?: string
  prayer_topic: Localised
}

export interface PreparedDay {
  dayNumber: number
  kind: 'devotion' | 'summary'
  topicEn: string
  topicAm: string
  purposeEn: string
  purposeAm: string
  prayerEn: string
  prayerAm: string
  passage: ScriptureRef | null
  keyVerses: ScriptureRef[]
  crossRefs: ScriptureRef[]
  /** Exactly as the ministry wrote them, including anything we could not parse. */
  passageRaw: string
  keyVersesRaw: string
  crossRefsRaw: string
  expectedSeconds: number
}

export interface PreparedBook {
  sourceId: string
  sequence: number
  titleEn: string
  titleAm: string
  /** The canonical book the study is about — the inheritance root for bare refs. */
  canonicalBook: number
  days: PreparedDay[]
  summaryQuestions: Array<{ ordinal: number; questionEn: string; questionAm: string }>
}

export interface ContentIssue {
  book: string
  day: number
  field: 'verses' | 'key_verses' | 'cross_references' | 'topic'
  raw: string
  code: ParseIssue['code'] | ValidationIssue['code']
  message: string
  suggestion?: string
  /** The flagged substring within `raw`, so a suggestion can be applied by replacing it. Empty for a validation issue, which flags a whole resolved reference rather than a token. */
  token: string
}

/**
 * Which canonical book each study is about. This is the root of reference
 * inheritance: in the Ruth study, a bare `1:1` means Ruth 1:1.
 */
export const STUDY_BOOKS: Record<string, number> = {
  'BOOK 01': 8, // Ruth
  'BOOK 02': 19, // Psalms
  'BOOK 03': 54, // 1 Timothy
}

const AMHARIC_SUMMARY_TITLE = 'ማጠቃለያ ጥያቄዎች'
const ENGLISH_SUMMARY_TITLE = 'Summary Questions'

interface FieldResult {
  refs: ScriptureRef[]
  issues: ContentIssue[]
}

function readField(
  raw: string | undefined,
  field: ContentIssue['field'],
  book: string,
  day: number,
  canonicalBook: number,
  defaultChapter?: number,
): FieldResult {
  if (!raw || !String(raw).trim()) return { refs: [], issues: [] }
  const text = String(raw)
  const parsed = parseReferences(text, {
    defaultBook: canonicalBook,
    ...(defaultChapter !== undefined ? { defaultChapter } : {}),
  })

  const issues: ContentIssue[] = parsed.issues.map((i) => ({
    book,
    day,
    field,
    raw: text,
    code: i.code,
    message: `${i.message} (${i.token})`,
    token: i.token,
    ...(i.suggestion ? { suggestion: i.suggestion } : {}),
  }))

  for (const r of parsed.refs) {
    for (const v of validateRef(r)) {
      issues.push({ book, day, field, raw: text, code: v.code, message: v.message, token: '' })
    }
  }

  return { refs: parsed.refs, issues }
}

/**
 * Turn one exported bundle into rows ready for the database, and a list of every
 * problem a human has to decide about. Nothing is silently corrected: a suggestion
 * is recorded for review, and the reference is imported as written.
 */
export function prepareBundle(
  bundle: SourceBundle,
  sequenceOffset = 0,
): { books: PreparedBook[]; issues: ContentIssue[] } {
  const books: PreparedBook[] = []
  const issues: ContentIssue[] = []

  bundle.books.forEach((src, i) => {
    const canonicalBook = STUDY_BOOKS[src.book_id]
    if (canonicalBook === undefined) {
      throw new Error(
        `Unknown study book ${src.book_id}. Add it to STUDY_BOOKS so bare references can inherit a book.`,
      )
    }

    const days: PreparedDay[] = src.daily_devotions.map((d) => {
      // Psalms has no `verses` field; the passage lives in the topic string.
      const fromTopic = d.verses ? null : passageFromTopic(d.topic.en, canonicalBook)
      const passageField = readField(d.verses, 'verses', src.book_id, d.day, canonicalBook)
      const passage = passageField.refs[0] ?? fromTopic
      issues.push(...passageField.issues)

      if (!passage) {
        issues.push({
          book: src.book_id,
          day: d.day,
          field: 'topic',
          raw: d.topic.en,
          code: 'no_context',
          message: 'No passage on this day, and none could be read from the topic.',
          token: '',
        })
      }

      // Key verses and cross references inherit the passage's chapter, which is
      // what makes `1:15፣16` and a bare `5` resolve the way the ministry means.
      const chapterContext = passage?.chapter
      const keys = readField(
        d.key_verses, 'key_verses', src.book_id, d.day, canonicalBook, chapterContext,
      )
      const cross = readField(
        d.cross_references, 'cross_references', src.book_id, d.day, canonicalBook, chapterContext,
      )
      issues.push(...keys.issues, ...cross.issues)

      return {
        dayNumber: d.day,
        kind: 'devotion' as const,
        topicEn: d.topic.en,
        topicAm: d.topic.am,
        purposeEn: d.purpose.en,
        purposeAm: d.purpose.am,
        prayerEn: d.prayer_topic.en,
        prayerAm: d.prayer_topic.am,
        passage,
        keyVerses: keys.refs,
        crossRefs: cross.refs,
        // The whole field as written. A reference we could not parse is absent
        // from the arrays above, and would otherwise disappear from the editor.
        passageRaw: d.verses ?? passage?.raw ?? '',
        keyVersesRaw: d.key_verses ?? '',
        crossRefsRaw: d.cross_references ?? '',
        expectedSeconds: computeExpectedSeconds(
          [d.topic.en, d.purpose.en, d.prayer_topic.en].join(' '),
        ),
      }
    })

    // The summary day is a real day: its own number, its own scheduled date, and it
    // counts toward the streak like any other. Without this, every round is short by
    // one day per book.
    const lastDay = days.reduce((max, d) => Math.max(max, d.dayNumber), 0)
    const questions = src.summary_questions.map((q, ordinal) => ({
      ordinal: ordinal + 1,
      questionEn: q.question.en,
      questionAm: q.question.am,
    }))

    days.push({
      dayNumber: lastDay + 1,
      kind: 'summary',
      topicEn: `${ENGLISH_SUMMARY_TITLE} — ${src.title.en}`,
      topicAm: `${AMHARIC_SUMMARY_TITLE} — ${src.title.am}`,
      purposeEn: '',
      purposeAm: '',
      prayerEn: '',
      prayerAm: '',
      passage: null,
      keyVerses: [],
      crossRefs: [],
      passageRaw: '',
      keyVersesRaw: '',
      crossRefsRaw: '',
      expectedSeconds: computeExpectedSeconds(questions.map((q) => q.questionEn).join(' ')),
    })

    books.push({
      sourceId: src.book_id,
      sequence: sequenceOffset + i + 1,
      titleEn: src.title.en,
      titleAm: src.title.am,
      canonicalBook,
      days,
      summaryQuestions: questions,
    })
  })

  return { books, issues }
}

/**
 * Days run every calendar day including Sundays, consecutively, with each book
 * starting the day after the previous one ends.
 */
export function scheduleDays(books: PreparedBook[], startsOn: string): Map<string, string> {
  const dates = new Map<string, string>()
  const cursor = new Date(`${startsOn}T00:00:00Z`)
  for (const book of [...books].sort((a, b) => a.sequence - b.sequence)) {
    for (const day of [...book.days].sort((a, b) => a.dayNumber - b.dayNumber)) {
      dates.set(`${book.sourceId}#${day.dayNumber}`, cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  return dates
}
