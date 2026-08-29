/**
 * What it means to have "done" a devotion. Deliberately generous — this is a
 * spiritual practice, not an exam. Done is *always* tappable; unmet conditions
 * only mean the UI asks once before recording confirmedEarly.
 */
export interface CompletionSignals {
  scrollDepth: number
  /** Foregrounded seconds only — the timer pauses on background. */
  foregroundSeconds: number
  expectedSeconds: number
}

export const MIN_SCROLL_DEPTH = 0.95
export const ABSOLUTE_MIN_SECONDS = 60

export const requiredSeconds = (expectedSeconds: number): number =>
  Math.max(ABSOLUTE_MIN_SECONDS, 0.5 * expectedSeconds)

/** True when Done can be tapped without the soft confirm. */
export const meetsCompletionBar = (s: CompletionSignals): boolean =>
  s.scrollDepth >= MIN_SCROLL_DEPTH && s.foregroundSeconds >= requiredSeconds(s.expectedSeconds)

export const EXPECTED_SECONDS_FLOOR = 90
const WORDS_PER_MINUTE = 200

/**
 * One value for both languages, computed from the English text at import.
 * No per-locale difference by decision.
 */
export const computeExpectedSeconds = (englishText: string): number => {
  const words = englishText.trim().split(/\s+/).filter(Boolean).length
  return Math.max(EXPECTED_SECONDS_FLOOR, Math.round((words / WORDS_PER_MINUTE) * 60))
}
