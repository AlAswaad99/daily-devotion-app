import type { IsoDate, IsoInstant } from './ids.ts'
import type { StreakEvent } from './entities.ts'
import type { Profile, StreakState } from './entities.ts'

export interface RepairContext {
  user: Profile
  /** The scheduled date the user missed. */
  missedDate: IsoDate
  today: IsoDate
  now: IsoInstant
  state: StreakState
  /** Whether today's scheduled day is already complete — `double_up` depends on it. */
  todayComplete: boolean
}

export interface RepairCost {
  kind: 'credit' | 'action'
  amount: number
  descriptionEn: string
  descriptionAm: string
}

/**
 * Repair is a plugin, not a branch: rules must be addable and removable without
 * touching streak math. Rules never write — `apply` returns events the engine appends.
 */
export interface RepairRule {
  key: string
  labelEn: string
  labelAm: string
  eligible(ctx: RepairContext): boolean
  /** null means free. Always shown to the user before they commit. */
  cost(ctx: RepairContext): RepairCost | null
  apply(ctx: RepairContext): StreakEvent[]
}

export type RepairRegistry = ReadonlyMap<string, RepairRule>

export const createRegistry = (rules: readonly RepairRule[]): RepairRegistry =>
  new Map(rules.map((r) => [r.key, r]))
