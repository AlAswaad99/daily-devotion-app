import { describe, expect, it } from 'vitest'
import { parseReferences, passageFromTopic } from '../src/parse.ts'
import { formatRef, validateRef } from '../src/validate.ts'

const RUTH = 8
const PSALMS = 19
const TIMOTHY_1 = 54

const parse = (s: string, defaultBook: number, defaultChapter?: number) =>
  parseReferences(s, {
    defaultBook,
    ...(defaultChapter !== undefined ? { defaultChapter } : {}),
  })

describe('punctuation', () => {
  it('accepts the Ethiopic and ASCII chapter separators interchangeably', () => {
    const a = parse('1፡1', RUTH).refs[0]
    const b = parse('1:1', RUTH).refs[0]
    expect(a).toMatchObject({ book: RUTH, chapter: 1, verseStart: 1 })
    expect(formatRef(a!)).toBe(formatRef(b!))
  })

  it('strips the parentheses the source wraps passages in', () => {
    expect(parse('(1፡1-5)', RUTH).refs[0]).toMatchObject({
      chapter: 1, verseStart: 1, verseEnd: 5,
    })
  })

  it('splits on both Ethiopic list separators', () => {
    expect(parse('1፡1 ፤ 1፡4', RUTH).refs).toHaveLength(2)
    expect(parse('ሉቃ 1:80፣ ኢያሱ 1፡8', RUTH).refs).toHaveLength(2)
  })
})

describe('inheritance', () => {
  it('inherits the study book when no book is named', () => {
    expect(parse('1፡5', TIMOTHY_1).refs[0]).toMatchObject({ book: TIMOTHY_1, chapter: 1 })
  })

  it('inherits the chapter for a bare verse in a list', () => {
    const { refs } = parse('1፡15፣16', TIMOTHY_1)
    expect(refs).toHaveLength(2)
    expect(refs[1]).toMatchObject({ book: TIMOTHY_1, chapter: 1, verseStart: 16 })
  })

  // The case that matters most: read without book inheritance, `2:52` resolves to
  // 1 Timothy 2:52, which does not exist.
  it('inherits the book across a list, not the study book', () => {
    const { refs } = parse('ሉቃ 1:80፣ 2፡52', TIMOTHY_1)
    expect(refs[1]).toMatchObject({ book: 42, chapter: 2, verseStart: 52 })
    expect(formatRef(refs[1]!)).toBe('Luke 2:52')
    expect(validateRef(refs[1]!)).toEqual([])
  })

  it('reads a bare number as a chapter when no verse context precedes it', () => {
    expect(parse('42', PSALMS).refs[0]).toMatchObject({
      chapter: 42, verseStart: null,
    })
  })
})

describe('shapes', () => {
  it('treats a reference with no verse range as the whole chapter', () => {
    const r = parse('ኢዮብ 3', RUTH).refs[0]!
    expect(r.verseStart).toBeNull()
    expect(formatRef(r)).toBe('Job 3')
  })

  it('reads a span that crosses a chapter boundary', () => {
    const r = parse('ሩት 1:17-2:2', RUTH).refs[0]!
    expect(r).toMatchObject({ chapter: 1, verseStart: 17, chapterEnd: 2, verseEnd: 2 })
    expect(formatRef(r)).toBe('Ruth 1:17-2:2')
  })

  it('matches a book name that runs straight into the chapter number', () => {
    const { refs, issues } = parse('1 ሳሙ2፡21', RUTH)
    expect(refs[0]).toMatchObject({ book: 9, chapter: 2, verseStart: 21 })
    expect(issues.map((i) => i.code)).toContain('missing_space')
  })
})

describe('the six references flagged for ministry review', () => {
  it('1. ኢሱ 24:15 — not a book, and suggests Joshua', () => {
    const { issues } = parse('ዘፍ 24፡58 ፤ ኢሱ 24፡15', RUTH)
    const unknown = issues.find((i) => i.code === 'unknown_book')
    expect(unknown).toBeDefined()
    expect(unknown!.suggestion).toContain('ኢያሱ')
  })

  it('2. ዘዳ 18:23 — parses, but Deuteronomy 18 has only 22 verses', () => {
    const r = parse('ዘዳ 18:23', PSALMS).refs[0]!
    expect(r).toMatchObject({ book: 5, chapter: 18, verseStart: 23 })
    expect(validateRef(r).map((v) => v.code)).toEqual(['no_such_verse'])
  })

  it('3. 1ኛ ጢሞ 1:22: 5:8 — two references joined by a colon, so refuse to guess', () => {
    const { refs, issues } = parse('1ኛ ጢሞ 1:22: 5:8', TIMOTHY_1)
    expect(refs).toHaveLength(0)
    expect(issues.map((i) => i.code)).toContain('ambiguous_separator')
  })

  it('4. 68፤4-6 — ፤ used where ፡ belongs, merged into one reference and flagged', () => {
    const { refs, issues } = parse('68፤4-6', PSALMS)
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ chapter: 68, verseStart: 4, verseEnd: 6 })
    expect(formatRef(refs[0]!)).toBe('Psalms 68:4-6')
    expect(issues.map((i) => i.code)).toContain('ambiguous_separator')
  })

  it('5. 71፡-5-6 — stray hyphen, corrected with the slip recorded', () => {
    const { refs, issues } = parse('71፡-5-6', PSALMS)
    expect(refs[0]).toMatchObject({ chapter: 71, verseStart: 5, verseEnd: 6 })
    expect(issues.map((i) => i.code)).toContain('stray_punctuation')
  })

  it('6. 1 ሳሙ2፡21 inside a chained list still resolves every reference', () => {
    const { refs } = parse('ሉቃ 1:80፣ 2፡52፣ 1 ሳሙ2፡21፣ ኢያሱ 1፡8', TIMOTHY_1)
    expect(refs.map((r) => formatRef(r))).toEqual([
      'Luke 1:80', 'Luke 2:52', '1 Samuel 2:21', 'Joshua 1:8',
    ])
  })
})

describe('passageFromTopic', () => {
  it('recovers the Psalm number the topic string carries', () => {
    expect(passageFromTopic("Psalm 42 - God's Ceaseless Presence", PSALMS)).toMatchObject({
      book: PSALMS, chapter: 42, verseStart: null,
    })
  })

  it('returns null when the topic names no passage', () => {
    expect(passageFromTopic('Decision', PSALMS)).toBeNull()
  })
})
