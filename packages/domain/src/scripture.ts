/**
 * Canonical scripture reference. `book` is the 1..66 canonical index, never a name —
 * names are localised at render time. A reference with no verse range means the
 * whole chapter. `raw` is the ministry's original string, kept for admin display
 * and audit so an editor sees what was written, not just what we parsed.
 */
export interface ScriptureRef {
  book: number
  chapter: number
  verseStart: number | null
  verseEnd: number | null
  /** Set only for cross-chapter spans, e.g. 5:17–6:2. */
  chapterEnd: number | null
  raw: string
}

export const isWholeChapter = (r: ScriptureRef): boolean =>
  r.verseStart === null && r.chapterEnd === null
