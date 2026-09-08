import type { ScriptureRef } from '@abide/domain'
import { BOOKS } from './lexicon-books.ts'

/**
 * Parser for the ministry's scripture references.
 *
 * The source strings are handwritten Amharic citations and they use the full range
 * of Ethiopic punctuation, inconsistently:
 *
 *   ዘፍ 24፡58 ፤ ኢያሱ 24፡15     book, chapter separator ፡, list separator ፤
 *   ሉቃ 1:80፣ 2፡52             ASCII colon and ፣, and `2:52` inherits *Luke*
 *   1፡15፣16                    `16` inherits both book and chapter
 *   1 ሳሙ2፡21                   no space between book and chapter
 *   (1፡1-5)                     wrapped in parentheses
 *
 * Inheritance is the dangerous part and is not optional: read without it,
 * `ሉቃ 1:80፣ 2፡52` resolves to 1 Timothy 2:52, which does not exist. Every parse
 * therefore carries a context that carries forward across a list.
 */

export type IssueCode =
  | 'unknown_book'
  | 'unparseable'
  | 'ambiguous_separator'
  | 'stray_punctuation'
  | 'missing_space'
  | 'no_context'

export interface ParseIssue {
  code: IssueCode
  /** The token, or the whole string when the problem is not localised to one token. */
  token: string
  message: string
  /** Present when we are confident enough to propose a correction for review. */
  suggestion?: string
}

export interface ParseResult {
  refs: ScriptureRef[]
  issues: ParseIssue[]
}

export interface ParseContext {
  /** The book the study is about — how a bare `3:1` resolves. */
  defaultBook: number
  defaultChapter?: number
}

const LIST_SEPARATORS = /[፤፣;,]/
const ETHIOPIC_COLON = /[፡]/g

/**
 * Ethiopic script has no case, but the digits and ASCII punctuation vary. Exported
 * because a `ParseIssue.token` is a substring of *this*, not of the original raw
 * field — applying a suggestion has to replace within the same normalised text.
 */
export const normalise = (raw: string): string =>
  raw
    .normalize('NFC')
    .replace(/[()\[\]]/g, ' ')
    .replace(ETHIOPIC_COLON, ':')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()

interface BookMatch {
  index: number
  rest: string
  /** True when a digit follows the name with no space, as in `1 ሳሙ2፡21`. */
  runsIntoNumber: boolean
}

/**
 * Longest match wins, and the match does not need to be followed by a space —
 * `1 ሳሙ2፡21` is a real string in the data.
 */
const matchBook = (token: string): BookMatch | null => {
  const candidates: Array<{ text: string; index: number }> = []
  for (const b of BOOKS) {
    candidates.push({ text: b.am, index: b.index })
    candidates.push({ text: b.en, index: b.index })
    for (const a of b.abbreviations) candidates.push({ text: a, index: b.index })
  }
  candidates.sort((a, b) => b.text.length - a.text.length)

  const t = token.trimStart()
  for (const c of candidates) {
    if (t.startsWith(c.text)) {
      const tail = t.slice(c.text.length)
      return { index: c.index, rest: tail.trim(), runsIntoNumber: /^\d/.test(tail) }
    }
  }
  return null
}

/** One Ethiopic character away from a known name, e.g. ኢሱ for ኢያሱ. */
const suggestBook = (token: string): string | null => {
  const word = token.replace(/[\d\s:.-].*$/, '').trim()
  if (word.length < 2) return null
  let best: { name: string; distance: number } | null = null
  for (const b of BOOKS) {
    for (const name of [b.am, ...b.abbreviations]) {
      const d = editDistance(word, name)
      if (d > 0 && d <= 1 && (!best || d < best.distance)) best = { name, distance: d }
    }
  }
  return best?.name ?? null
}

const editDistance = (a: string, b: string): number => {
  const av = [...a]
  const bv = [...b]
  let prev = Array.from({ length: bv.length + 1 }, (_, i) => i)
  for (let i = 1; i <= av.length; i++) {
    const row = [i]
    for (let j = 1; j <= bv.length; j++) {
      row[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (av[i - 1] === bv[j - 1] ? 0 : 1),
      )
    }
    prev = row
  }
  return prev[bv.length] ?? 0
}

const ref = (
  book: number,
  chapter: number,
  verseStart: number | null,
  verseEnd: number | null,
  chapterEnd: number | null,
  raw: string,
): ScriptureRef => ({ book, chapter, verseStart, verseEnd, chapterEnd, raw })

/**
 * Parse a reference string into canonical refs, carrying book and chapter forward
 * across the list. Returns whatever it could resolve plus everything it could not,
 * because the importer's job is to report problems to the ministry, not to guess.
 */
export function parseReferences(raw: string, ctx: ParseContext): ParseResult {
  const refs: ScriptureRef[] = []
  const issues: ParseIssue[] = []
  const text = normalise(raw)
  if (!text) return { refs, issues }

  let book = ctx.defaultBook
  let chapter = ctx.defaultChapter ?? null
  /** Whether the previous token named verses — decides what a bare number means. */
  let lastHadVerses = false
  /** Whether the previous token was a chapter with no verses. */
  let lastWasChapterOnly = false

  const tokens = text
    .split(LIST_SEPARATORS)
    .map((t) => t.trim())
    .filter(Boolean)

  for (const token of tokens) {
    let body = token
    let raw = token

    const named = matchBook(body)
    if (named) {
      if (named.runsIntoNumber) {
        issues.push({
          code: 'missing_space',
          token,
          message: 'No space between the book name and the chapter.',
          suggestion: `${token.slice(0, token.length - named.rest.length).trim()} ${named.rest}`,
        })
      }
      book = named.index
      body = named.rest
    } else if (/^[^\d\s]/.test(body)) {
      const suggestion = suggestBook(body)
      issues.push({
        code: 'unknown_book',
        token,
        message: 'Not a book of the Bible.',
        ...(suggestion ? { suggestion: token.replace(/^[^\d\s:.-]+/, suggestion) } : {}),
      })
      continue
    }

    // `71:-5-6` — a stray hyphen immediately after the chapter separator.
    if (/:\s*-/.test(body)) {
      issues.push({
        code: 'stray_punctuation',
        token,
        message: 'Stray hyphen after the chapter separator.',
        suggestion: token.replace(/([:፡])\s*-/, '$1'),
      })
      body = body.replace(/:\s*-/, ':')
    }

    // More than one chapter separator and no list separator between them:
    // `1:22: 5:8` could be 1:2 + 5:8, or something else entirely. Do not guess.
    if ((body.match(/:/g) ?? []).length > 1 && !/-/.test(body)) {
      issues.push({
        code: 'ambiguous_separator',
        token,
        message:
          'Two references joined by a chapter separator rather than a list separator — the intent is unclear.',
      })
      continue
    }

    // book chapter:verse - chapter:verse   (a span crossing a chapter boundary)
    const span = /^(\d+)\s*:\s*(\d+)\s*-\s*(\d+)\s*:\s*(\d+)$/.exec(body)
    if (span) {
      chapter = Number(span[1])
      refs.push(ref(book, chapter, Number(span[2]), Number(span[4]), Number(span[3]), raw))
      lastHadVerses = true
      lastWasChapterOnly = false
      continue
    }

    // book chapter:verse[-verse]
    const single = /^(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/.exec(body)
    if (single) {
      chapter = Number(single[1])
      refs.push(ref(book, chapter, Number(single[2]), single[3] ? Number(single[3]) : null, null, raw))
      lastHadVerses = true
      lastWasChapterOnly = false
      continue
    }

    // A bare number or range means one of three things, decided by what came before.
    const bare = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(body)
    if (bare) {
      const first = Number(bare[1])
      const second = bare[2] ? Number(bare[2]) : null

      if (lastHadVerses && chapter !== null) {
        // `1፡15፣16` — verses of the chapter already in hand.
        refs.push(ref(book, chapter, first, second, null, raw))
        continue
      }

      if (lastWasChapterOnly && chapter !== null) {
        // `68 ፤ 4-6` — the list separator was used where the chapter separator
        // belongs. Read as one reference, and say so: the alternative reading is a
        // whole chapter plus a stray chapter range, which nobody wrote on purpose.
        const previous = refs.pop()
        refs.push(ref(book, chapter, first, second, null, previous?.raw ?? raw))
        issues.push({
          code: 'ambiguous_separator',
          token,
          message:
            'A list separator was used where the chapter separator belongs; read as a single reference.',
          suggestion: `${chapter}:${first}${second === null ? '' : `-${second}`}`,
        })
        lastHadVerses = true
        lastWasChapterOnly = false
        continue
      }

      chapter = first
      refs.push(ref(book, first, null, null, null, raw))
      lastHadVerses = false
      lastWasChapterOnly = true
      continue
    }

    issues.push({ code: 'unparseable', token, message: 'Could not be read as a reference.' })
  }

  return { refs, issues }
}

/**
 * Psalms days carry no `verses` field — the passage is baked into the topic
 * string, e.g. `"Psalm 42 - God's Ceaseless Presence"`. Pull it back out.
 * Going forward the dashboard requires an explicit reference on every day.
 */
export function passageFromTopic(topic: string, defaultBook: number): ScriptureRef | null {
  const m = /(?:Psalms?|መዝሙር|መዝ)\s*(\d+)/u.exec(topic.normalize('NFC'))
  if (!m) return null
  return ref(defaultBook, Number(m[1]), null, null, null, m[0])
}
