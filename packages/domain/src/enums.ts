export const LANGUAGES = ['en', 'am'] as const
export type Language = (typeof LANGUAGES)[number]

export const PARTS_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const
export type PartOfDay = (typeof PARTS_OF_DAY)[number]

export const ROLES = ['user', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const CONTENT_STATUSES = ['draft', 'in_review', 'published', 'archived'] as const
export type ContentStatus = (typeof CONTENT_STATUSES)[number]

export const ROUND_STATUSES = ['draft', 'published', 'archived'] as const
export type RoundStatus = (typeof ROUND_STATUSES)[number]

export const DAY_KINDS = ['devotion', 'summary'] as const
export type DayKind = (typeof DAY_KINDS)[number]

export const COMPLETION_METHODS = ['live', 'backfill', 'repair'] as const
/** `live` counts for the streak, `backfill` never does, `repair` restores a broken link. */
export type CompletionMethod = (typeof COMPLETION_METHODS)[number]

export const STREAK_EVENT_KINDS = ['extended', 'broken', 'repaired', 'frozen'] as const
export type StreakEventKind = (typeof STREAK_EVENT_KINDS)[number]

/** Day arithmetic is always done here, never in the device's zone. */
export const MINISTRY_TIMEZONE = 'Africa/Addis_Ababa'
