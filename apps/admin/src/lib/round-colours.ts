/**
 * The round palette.
 *
 * Six hues, in this order. The order is load-bearing rather than cosmetic: it was
 * chosen by running the set through a colour-vision validator, and the neighbouring
 * pairs are the ones that have to stay apart. Re-ordering this list breaks that —
 * a swapped pair drops deuteranope separation from ΔE 14.5 to 4.4, which is two
 * rounds a colour-blind admin cannot tell apart. Add or re-order only after
 * re-validating.
 *
 * Every hue clears 3:1 against the calendar's white and grey cell backgrounds, so
 * the stripe stays visible on a past day as well as a future one.
 *
 * Colour is never the only signal: each round is named in the calendar legend and
 * every cell still carries its book title, so this is grouping, not encoding.
 */
export const ROUND_COLOURS = [
  { key: 'terracotta', hex: '#b4522a', label: 'Terracotta' },
  { key: 'blue', hex: '#2a78d6', label: 'Blue' },
  { key: 'green', hex: '#158a61', label: 'Green' },
  { key: 'violet', hex: '#4a3aa7', label: 'Violet' },
  { key: 'gold', hex: '#a07400', label: 'Gold' },
  { key: 'magenta', hex: '#b03a7a', label: 'Magenta' },
] as const

export type RoundColour = (typeof ROUND_COLOURS)[number]['key']

export const DEFAULT_ROUND_COLOUR: RoundColour = 'terracotta'

const BY_KEY = new Map(ROUND_COLOURS.map((c) => [c.key, c]))

/** Falls back rather than throwing: a colour is decoration, never a reason to fail a page. */
export function roundHex(key: string | null | undefined): string {
  return BY_KEY.get((key ?? '') as RoundColour)?.hex ?? BY_KEY.get(DEFAULT_ROUND_COLOUR)!.hex
}

export function roundLabel(key: string | null | undefined): string {
  return BY_KEY.get((key ?? '') as RoundColour)?.label ?? 'Terracotta'
}

/** The next unused colour, so a new round does not silently match an existing one. */
export function suggestColour(taken: ReadonlyArray<string>): RoundColour {
  const free = ROUND_COLOURS.find((c) => !taken.includes(c.key))
  return (free ?? ROUND_COLOURS[taken.length % ROUND_COLOURS.length]!).key
}
