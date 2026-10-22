/**
 * Paid-referral rewards (pure). The XP referral (lib/referral-service.ts)
 * stays as is; this adds a billing reward for the referrer once the referred
 * account has paid for, and kept, its first month:
 *   - the referee's first paid plan order (amount > 0) starts a pending reward,
 *     due 30 days after that order's period start (or at its end if shorter);
 *   - at the due date the order must still be paid (not refunded) and the
 *     referee's plan still live;
 *   - abuse: no reward when the two accounts share a device fingerprint, a
 *     sign-up / checkout IP, or a payment fingerprint (card / UPI / wallet).
 * Reward: a free month on the referrer's plan, or a credit in the referee's
 * order currency (admin setting).
 */

export const REFERRAL_QUALIFY_DAYS = 30

export type ReferralRewardKind = 'free_month' | 'credit'
export interface ReferralRewardSettings {
  kind: ReferralRewardKind
  credit_minor: { INR: number; USD: number }
  /** Rewards one referrer can earn per calendar year. */
  yearly_cap: number
}
export const DEFAULT_REFERRAL_REWARD: ReferralRewardSettings = { kind: 'free_month', credit_minor: { INR: 10000, USD: 200 }, yearly_cap: 12 }

export function rewardDueAt(periodStart: string, periodEnd?: string | null): string {
  const start = Date.parse(periodStart)
  const due = start + REFERRAL_QUALIFY_DAYS * 86_400_000
  const end = periodEnd ? Date.parse(periodEnd) : NaN
  return new Date(Number.isFinite(end) ? Math.min(due, end) : due).toISOString()
}

export interface AbuseSignals {
  referrer: { deviceIds: string[]; ips: string[]; paymentFingerprints: string[] }
  referee: { deviceIds: string[]; ips: string[]; paymentFingerprints: string[] }
}

const overlap = (a: string[], b: string[]) => {
  const s = new Set(a.filter(Boolean))
  return b.some((x) => x && s.has(x))
}

/** First abuse rule that matches, or null. */
export function referralAbuse(s: AbuseSignals): 'same_device' | 'same_ip' | 'same_payment' | null {
  if (overlap(s.referrer.deviceIds, s.referee.deviceIds)) return 'same_device'
  if (overlap(s.referrer.paymentFingerprints, s.referee.paymentFingerprints)) return 'same_payment'
  if (overlap(s.referrer.ips, s.referee.ips)) return 'same_ip'
  return null
}

export type RewardOutcome = 'wait' | 'grant' | 'void_refunded' | 'void_lapsed' | 'void_abuse' | 'void_cap'

export function decideReferralReward(input: {
  dueAt: string
  now: Date
  orderStatus: string
  refereePlanLive: boolean
  abuse: ReturnType<typeof referralAbuse>
  rewardsThisYear: number
  settings: Pick<ReferralRewardSettings, 'yearly_cap'>
}): RewardOutcome {
  if (input.orderStatus === 'refunded') return 'void_refunded'
  if (input.abuse) return 'void_abuse'
  if (Date.parse(input.dueAt) > input.now.getTime()) return 'wait'
  if (input.orderStatus !== 'paid') return 'void_refunded'
  if (!input.refereePlanLive) return 'void_lapsed'
  if (input.rewardsThisYear >= input.settings.yearly_cap) return 'void_cap'
  return 'grant'
}

/** Stable, non-reversible fingerprint of a payment instrument from a gateway payment entity. */
export function paymentFingerprintSource(entity: Record<string, unknown> | null | undefined): string | null {
  if (!entity) return null
  const card = entity.card as Record<string, unknown> | undefined
  if (card && (card.fingerprint || card.last4)) {
    return card.fingerprint ? `card:${String(card.fingerprint)}` : `card:${String(card.network || '')}:${String(card.issuer || '')}:${String(card.last4)}`
  }
  if (entity.vpa) return `vpa:${String(entity.vpa).toLowerCase()}`
  if (entity.wallet && entity.contact) return `wallet:${String(entity.wallet)}:${String(entity.contact)}`
  if (entity.bank && entity.contact) return `bank:${String(entity.bank)}:${String(entity.contact)}`
  return null
}
