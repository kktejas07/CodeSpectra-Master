/**
 * Plan-change maths (pure). All amounts are integer minor units of ONE
 * currency; a change across currencies is not prorated (refused).
 *
 *  - upgrade, same cycle  → pay the price difference for the time left; the
 *                           period end stays the same.
 *  - cycle change / any   → the unused part of the current period becomes a
 *    upgrade to a longer    credit against the full new period, which starts now.
 *    cycle
 *  - downgrade            → never refunded mid-period: it takes effect at renewal.
 */

export type ChangeKind = 'upgrade_same_cycle' | 'new_period_with_credit' | 'downgrade_at_renewal' | 'no_change'

export interface ProrationInput {
  currentAmount: number
  currentStart: string | Date
  currentEnd: string | Date
  currentInterval: 'month' | 'year'
  currentCurrency: string
  newAmount: number
  newInterval: 'month' | 'year'
  newCurrency: string
  /** Same plan key? (a cycle change on the same plan is not an upgrade.) */
  samePlan?: boolean
  now?: Date
}

export type ProrationQuote =
  | {
      ok: true
      kind: ChangeKind
      /** Charged now. */
      chargeNow: number
      /** Value of the unused current period that was applied. */
      credit: number
      /** Fraction of the current period still unused, 0..1 (4 decimals). */
      remainingFraction: number
      /** When the new plan's paid period ends. */
      periodEnd: string
    }
  | { ok: false; reason: 'currency_mismatch' | 'period_over' | 'invalid' }

const ms = (d: string | Date) => (d instanceof Date ? d.getTime() : Date.parse(d))
const DAY = 86_400_000

export function addInterval(from: Date, interval: 'month' | 'year'): Date {
  return new Date(from.getTime() + (interval === 'year' ? 365 : 30) * DAY)
}

export function prorationQuote(p: ProrationInput): ProrationQuote {
  const now = p.now ?? new Date()
  const start = ms(p.currentStart)
  const end = ms(p.currentEnd)
  const amounts = [p.currentAmount, p.newAmount]
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || amounts.some((a) => !Number.isInteger(a) || a < 0)) {
    return { ok: false, reason: 'invalid' }
  }
  if (p.currentCurrency.toUpperCase() !== p.newCurrency.toUpperCase()) return { ok: false, reason: 'currency_mismatch' }
  if (now.getTime() >= end) return { ok: false, reason: 'period_over' }

  const remaining = Math.min(1, Math.max(0, (end - now.getTime()) / (end - start)))
  const fraction = Math.round(remaining * 10_000) / 10_000
  const credit = Math.floor(p.currentAmount * remaining)
  const endIso = new Date(end).toISOString()

  if (p.newInterval === p.currentInterval) {
    if (p.samePlan && p.newAmount === p.currentAmount) return { ok: true, kind: 'no_change', chargeNow: 0, credit: 0, remainingFraction: fraction, periodEnd: endIso }
    if (p.newAmount <= p.currentAmount) {
      return { ok: true, kind: 'downgrade_at_renewal', chargeNow: 0, credit: 0, remainingFraction: fraction, periodEnd: endIso }
    }
    const diff = Math.ceil((p.newAmount - p.currentAmount) * remaining)
    return { ok: true, kind: 'upgrade_same_cycle', chargeNow: diff, credit: 0, remainingFraction: fraction, periodEnd: endIso }
  }

  // Shorter cycle (year → month) is a downgrade of commitment: at renewal.
  if (p.newInterval === 'month' && p.currentInterval === 'year') {
    return { ok: true, kind: 'downgrade_at_renewal', chargeNow: 0, credit: 0, remainingFraction: fraction, periodEnd: endIso }
  }
  const applied = Math.min(credit, p.newAmount)
  return {
    ok: true,
    kind: 'new_period_with_credit',
    chargeNow: p.newAmount - applied,
    credit: applied,
    remainingFraction: fraction,
    periodEnd: addInterval(now, p.newInterval).toISOString(),
  }
}
