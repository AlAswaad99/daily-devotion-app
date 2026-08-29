/** Branded ids — a BookId can never be passed where a RoundId is expected. */
declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type ChurchId = Brand<string, 'ChurchId'>
export type MinistryId = Brand<string, 'MinistryId'>
export type UserId = Brand<string, 'UserId'>
export type RoundId = Brand<string, 'RoundId'>
export type BookId = Brand<string, 'BookId'>
export type DevotionDayId = Brand<string, 'DevotionDayId'>

/** ISO date, no time component, always interpreted in EAT. */
export type IsoDate = Brand<string, 'IsoDate'>
/** ISO 8601 instant, always stored UTC. */
export type IsoInstant = Brand<string, 'IsoInstant'>

export const asIsoDate = (v: string): IsoDate => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`not an ISO date: ${v}`)
  return v as IsoDate
}
