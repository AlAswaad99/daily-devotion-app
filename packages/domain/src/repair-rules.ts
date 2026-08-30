import type { RepairContext, RepairCost, RepairRule } from './repair.ts'
import { createRegistry } from './repair.ts'
import type { StreakEvent } from './entities.ts'
import type { IsoDate } from './ids.ts'

/**
 * The two rules shipping in v1. No invites, no ads, no purchases.
 *
 * Rules never write. `apply` returns events for the engine to append, which is what
 * keeps repair addable and removable without touching streak math.
 */

const daysBetween = (a: IsoDate, b: IsoDate): number =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

const event = (ctx: RepairContext, key: string): StreakEvent => ({
  id: crypto.randomUUID(),
  userId: ctx.user.id,
  kind: 'repaired',
  occurredAt: ctx.now,
  scheduledDate: ctx.missedDate,
  meta: { rule: key },
})

/**
 * Complete today *and* the day you missed, in one sitting. The one I would lean on:
 * honest, costs nothing to operate, and drives exactly the behaviour the ministry
 * wants. Limited to the most recent miss within 48 hours so it cannot be used to
 * rebuild a week retroactively.
 */
export const doubleUp: RepairRule = {
  key: 'double_up',
  labelEn: 'Double up',
  labelAm: 'ሁለቱን አንድ ላይ',

  eligible(ctx) {
    if (!ctx.todayComplete) return false
    const age = daysBetween(ctx.missedDate, ctx.today)
    return age >= 1 && age <= 2
  },

  cost(): RepairCost {
    return {
      kind: 'action',
      amount: 1,
      descriptionEn: "Read the day you missed as well as today's.",
      descriptionAm: 'ያመለጠህን ቀን ከዛሬው ጋር አንብብ።',
    }
  },

  apply(ctx) {
    return [event(ctx, this.key)]
  },
}

/**
 * One credit a month, for the week you were ill or travelling. Deliberately scarce:
 * a credit that refreshes faster than the thing it forgives stops meaning anything.
 */
export const monthlyCredit: RepairRule = {
  key: 'monthly_credit',
  labelEn: 'Use a repair credit',
  labelAm: 'የጥገና ክሬዲት ተጠቀም',

  eligible(ctx) {
    if (ctx.state.repairCredits < 1) return false
    const age = daysBetween(ctx.missedDate, ctx.today)
    return age >= 1 && age <= 7
  },

  cost(ctx) {
    return {
      kind: 'credit',
      amount: 1,
      descriptionEn: `Uses 1 of your ${ctx.state.repairCredits} repair credits this month.`,
      descriptionAm: `በዚህ ወር ካሉህ ${ctx.state.repairCredits} የጥገና ክሬዲቶች 1 ይጠቀማል።`,
    }
  },

  apply(ctx) {
    return [event(ctx, this.key)]
  },
}

export const REPAIR_RULES = createRegistry([doubleUp, monthlyCredit])

/** Every rule that could repair this particular missed day, right now. */
export const eligibleRepairs = (ctx: RepairContext): RepairRule[] =>
  [...REPAIR_RULES.values()].filter((rule) => rule.eligible(ctx))
