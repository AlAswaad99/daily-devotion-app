import type { ScriptureRef } from '@abide/domain'
import { BOOKS } from './lexicon-books.ts'
import verseData from '../data/verse-counts.json' with { type: 'json' }

const COUNTS = verseData.counts as Record<string, number[]>

export interface ValidationIssue {
  code: 'no_such_book' | 'no_such_chapter' | 'no_such_verse' | 'inverted_range'
  ref: ScriptureRef
  message: string
}

export const chapterCount = (book: number): number => COUNTS[String(book)]?.length ?? 0

export const verseCount = (book: number, chapter: number): number =>
  COUNTS[String(book)]?.[chapter - 1] ?? 0

export const bookName = (book: number, language: 'en' | 'am'): string =>
  BOOKS[book - 1]?.[language] ?? `book ${book}`

/**
 * Check a reference against the chapters and verses that actually exist. A whole-
 * chapter reference only has to name a real chapter; a verse reference has to name
 * a verse that exists in at least one of the two bundled translations.
 */
export function validateRef(r: ScriptureRef): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const chapters = chapterCount(r.book)
  if (chapters === 0) {
    return [{ code: 'no_such_book', ref: r, message: `No book with index ${r.book}.` }]
  }

  const lastChapter = r.chapterEnd ?? r.chapter
  if (r.chapter < 1 || lastChapter > chapters) {
    issues.push({
      code: 'no_such_chapter',
      ref: r,
      message: `${bookName(r.book, 'en')} has ${chapters} chapters, not ${lastChapter}.`,
    })
    return issues
  }

  if (r.verseStart === null) return issues

  const startMax = verseCount(r.book, r.chapter)
  if (r.verseStart < 1 || r.verseStart > startMax) {
    issues.push({
      code: 'no_such_verse',
      ref: r,
      message: `${bookName(r.book, 'en')} ${r.chapter} has ${startMax} verses, not ${r.verseStart}.`,
    })
  }

  if (r.verseEnd !== null) {
    const endChapter = r.chapterEnd ?? r.chapter
    const endMax = verseCount(r.book, endChapter)
    if (r.verseEnd > endMax) {
      issues.push({
        code: 'no_such_verse',
        ref: r,
        message: `${bookName(r.book, 'en')} ${endChapter} has ${endMax} verses, not ${r.verseEnd}.`,
      })
    }
    if (r.chapterEnd === null && r.verseEnd < r.verseStart) {
      issues.push({
        code: 'inverted_range',
        ref: r,
        message: `Range runs backwards: ${r.verseStart}-${r.verseEnd}.`,
      })
    }
  }

  return issues
}

/** Human-readable rendering, for reports and for the admin dashboard. */
export function formatRef(r: ScriptureRef, language: 'en' | 'am' = 'en'): string {
  const name = bookName(r.book, language)
  if (r.verseStart === null) return `${name} ${r.chapter}`
  if (r.chapterEnd !== null) {
    return `${name} ${r.chapter}:${r.verseStart}-${r.chapterEnd}:${r.verseEnd}`
  }
  if (r.verseEnd !== null) return `${name} ${r.chapter}:${r.verseStart}-${r.verseEnd}`
  return `${name} ${r.chapter}:${r.verseStart}`
}
