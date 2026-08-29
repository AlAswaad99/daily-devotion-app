import type {
  BookId, ChurchId, DevotionDayId, IsoDate, IsoInstant, MinistryId, RoundId, UserId,
} from './ids.js'
import type {
  CompletionMethod, ContentStatus, DayKind, Language, PartOfDay, Role, RoundStatus,
  StreakEventKind,
} from './enums.js'
import type { ScriptureRef } from './scripture.js'

/** Every content and progress row carries church_id from day one — see spec, Domain model. */
export interface Church {
  id: ChurchId
  nameEn: string
  nameAm: string
}

export interface Ministry {
  id: MinistryId
  churchId: ChurchId
  nameEn: string
  nameAm: string
}

export interface Profile {
  id: UserId
  churchId: ChurchId
  ministryId: MinistryId
  displayName: string
  uiLanguage: Language
  /** Independent of uiLanguage: read the Bible in Amharic, use the app in English. */
  readerLanguage: Language
  partOfDay: PartOfDay
  /** Derived from partOfDay, then user-editable. Local time in MINISTRY_TIMEZONE. */
  reminderAt: string
  timezone: string
  role: Role
  /** The late-joiner boundary: days scheduled before this are excluded from streak math. */
  joinedOn: IsoDate
}

export interface Round {
  id: RoundId
  ministryId: MinistryId
  phaseCode: string
  roundCode: string
  mainVerseEn: string
  mainVerseAm: string
  startsOn: IsoDate
  status: RoundStatus
}

export interface Book {
  id: BookId
  roundId: RoundId
  sequence: number
  /** e.g. "BOOK 01" as it appears in the ministry's source JSON. */
  sourceId: string
  titleEn: string
  titleAm: string
  status: ContentStatus
  publishedAt: IsoInstant | null
}

/**
 * A book's closing questions are a real day with kind='summary': its own scheduled
 * date, counting toward the streak like any other. A ten-day Ruth study is eleven days.
 */
export interface DevotionDay {
  id: DevotionDayId
  bookId: BookId
  dayNumber: number
  kind: DayKind
  topicEn: string
  topicAm: string
  purposeEn: string
  purposeAm: string
  prayerEn: string
  prayerAm: string
  passage: ScriptureRef | null
  keyVerses: ScriptureRef[]
  crossRefs: ScriptureRef[]
  /** English word count of topic+purpose+prayer at 200 wpm, 90s floor. Admin-overridable. */
  expectedSeconds: number
  /** Null until the book is published and scheduled. */
  scheduledDate: IsoDate | null
  status: ContentStatus
}

export interface SummaryQuestion {
  id: string
  bookId: BookId
  ordinal: number
  questionEn: string
  questionAm: string
}

export interface DayCompletion {
  userId: UserId
  devotionDayId: DevotionDayId
  completedAt: IsoInstant
  countedForStreak: boolean
  method: CompletionMethod
  readingSeconds: number
  scrollDepth: number
  /** Tapped through the "finished already?" prompt. Analytics signal, never a penalty. */
  confirmedEarly: boolean
}

/** Append-only ledger. The streak is always reconstructible from this + completions. */
export interface StreakEvent {
  id: string
  userId: UserId
  kind: StreakEventKind
  occurredAt: IsoInstant
  scheduledDate: IsoDate
  meta: Record<string, unknown>
}

/** Cache. Derivable from the ledger. Never the source of truth. */
export interface StreakState {
  userId: UserId
  current: number
  best: number
  lastCountedDate: IsoDate | null
  repairCredits: number
}

/** Private to its author. Enforced by RLS with no admin bypass — not a UI decision. */
export interface Reflection {
  id: string
  userId: UserId
  devotionDayId: DevotionDayId
  body: string
  createdAt: IsoInstant
  updatedAt: IsoInstant
}

export interface PrayerSession {
  id: string
  userId: UserId
  startedAt: IsoInstant
  endedAt: IsoInstant | null
  durationSeconds: number
  completed: boolean
  interruptions: number
}
