/**
 * CORE-036: free days granted on top of a plan that a gateway renews by itself
 * (Razorpay subscriptions can't move their next charge date). The bonus is
 * stored on the subscription row (`gateway_bonus_days`) and added to every
 * period end the gateway reports, so a renewal webhook no longer overwrites
 * the extension. Pure helpers — used by lib/billing-plans.ts (activation) and
 * lib/billing/razorpay-subscriptions.ts (cancel sweep).
 */
const DAY_MS = 86_400_000

const days = (n: unknown): number => {
  const v = Math.floor(Number(n) || 0)
  return v > 0 ? Math.min(v, 3650) : 0
}

/** Access end for a gateway period end plus the stored bonus. */
export function withGatewayBonus(periodEndIso: string, bonusDays: unknown): string {
  const b = days(bonusDays)
  return b ? new Date(Date.parse(periodEndIso) + b * DAY_MS).toISOString() : periodEndIso
}

/** When the gateway itself charges next (access end minus the bonus). */
export function gatewayRenewalAt(endsAtIso: string, bonusDays: unknown): string {
  const b = days(bonusDays)
  return b ? new Date(Date.parse(endsAtIso) - b * DAY_MS).toISOString() : endsAtIso
}
