/**
 * Referral redemption + reward (audits CORE-005 / CORE-006).
 *
 *  - A referral code is recorded as a *pending* redemption: by POST
 *    /api/referral/apply (signed-in, e.g. after OAuth sign-up) or straight from
 *    the e-mail sign-up request, so it is not lost when "Require email
 *    verification" means there is no session yet.
 *  - The referrer's XP is paid only once the referred account has a verified
 *    e-mail AND a first graded activity (accepted submission, exam, arena…),
 *    and never when the two accounts were used on the same device
 *    (multi-account farming). completeReferralIfEligible runs whenever the
 *    referred user earns graded XP (lib/xp-service) and on the referrer's
 *    stats view, and is idempotent (atomic pending → completed claim + the
 *    XP ledger's own dedupe).
 */
import type { Db } from 'mongodb'
import { isReferralEligible, normaliseReferralCode, REFERRAL_WINDOW_DAYS } from '@/lib/referral-rules'

/** XP reasons that count as a "first graded activity". */
export const GRADED_XP_REASONS = [
  'submission_accepted', 'first_blood', 'exam_passed', 'certification_passed', 'challenge_completed',
  'arena_solved', 'codeathon_result', 'hackathon_score',
] as const

type Doc = Record<string, unknown>

// ─── Pure ───────────────────────────────────────────────────────────────────

/** Did the referred account verify its e-mail? (OAuth / SSO accounts are verified by the provider.) */
export function emailIsVerified(user: Doc | null | undefined): boolean {
  if (!user) return false
  if (user.emailVerified === true || user.email_verified === true) return true
  const p = String(user.provider || user.lastLoginMethod || '')
  return /google|github|sso/i.test(p)
}

/** Were both accounts seen on one device? (device_fingerprints rows, lib/db/security.) */
export function sharesDevice(fingerprints: Array<{ accounts?: Array<{ user_id?: unknown }> }>, a: string, b: string): boolean {
  return fingerprints.some((f) => {
    const ids = new Set((f.accounts || []).map((x) => String(x.user_id)))
    return ids.has(a) && ids.has(b)
  })
}

export type RewardDecision = 'reward' | 'wait' | 'blocked_same_device'
export function referralRewardDecision(input: { verified: boolean; graded: boolean; sameDevice: boolean }): RewardDecision {
  if (input.sameDevice) return 'blocked_same_device'
  return input.verified && input.graded ? 'reward' : 'wait'
}

// ─── DB ─────────────────────────────────────────────────────────────────────

let indexReady: Promise<void> | null = null
function ensureIndex(db: Db): Promise<void> {
  if (!indexReady) {
    indexReady = db.collection('referrals')
      .createIndex({ referred_id: 1 }, { unique: true, name: 'referred_id_unique', partialFilterExpression: { kind: 'redemption' } })
      .then(() => undefined)
      .catch((e) => { console.warn('[referral] unique index not created:', (e as Error)?.message) })
  }
  return indexReady
}

export type RedeemResult = { ok: true; status: 'pending' | 'completed' } | { ok: false; status: 400 | 404; error: string }

/** Record a (pending) redemption of `rawCode` by a new account. */
export async function recordReferralRedemption(
  db: Db,
  referred: { id: string; email?: string | null },
  rawCode: unknown,
  now = new Date(),
): Promise<RedeemResult> {
  const code = normaliseReferralCode(rawCode)
  if (!code) return { ok: false, status: 400, error: 'Referral code is required' }
  await ensureIndex(db)
  const col = db.collection('referrals')
  if (await col.findOne({ referred_id: referred.id })) return { ok: false, status: 400, error: 'You have already used a referral code' }
  const me = await db.collection('user').findOne({ id: referred.id }, { projection: { createdAt: 1, created_at: 1 } })
  if (!isReferralEligible(me?.createdAt ?? me?.created_at, now)) {
    return { ok: false, status: 400, error: `Referral codes can only be used within ${REFERRAL_WINDOW_DAYS} days of signing up` }
  }
  const codeDoc = await col.findOne({ referral_code: code, kind: { $ne: 'redemption' } })
  if (!codeDoc?.referrer_id) return { ok: false, status: 400, error: 'Invalid referral code' }
  if (codeDoc.referrer_id === referred.id) return { ok: false, status: 400, error: 'You cannot refer yourself' }
  const { newId, nowIso } = await import('@/lib/db/ids')
  try {
    await col.insertOne({
      id: newId(),
      kind: 'redemption',
      referrer_id: codeDoc.referrer_id,
      referred_id: referred.id,
      referred_email: referred.email ?? null,
      referral_code: code,
      status: 'pending',
      xp_awarded: 0,
      created_at: nowIso(),
      completed_at: null,
    })
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return { ok: false, status: 400, error: 'You have already used a referral code' }
    throw e
  }
  const done = await completeReferralIfEligible(db, referred.id)
  return { ok: true, status: done === 'reward' ? 'completed' : 'pending' }
}

/** Pay the referrer when the referred account qualifies. Safe to call often. */
export async function completeReferralIfEligible(db: Db, referredId: string): Promise<RewardDecision | 'none'> {
  const col = db.collection('referrals')
  const red = await col.findOne({ kind: 'redemption', referred_id: referredId, status: 'pending' })
  if (!red) return 'none'
  const referrerId = String(red.referrer_id)
  const [user, graded, prints] = await Promise.all([
    db.collection('user').findOne({ id: referredId }, { projection: { _id: 0, emailVerified: 1, email_verified: 1, provider: 1, lastLoginMethod: 1 } }),
    db.collection('xp_events').findOne({ user_id: referredId, reason: { $in: [...GRADED_XP_REASONS] } }, { projection: { _id: 1 } }),
    db.collection('device_fingerprints').find({ 'accounts.user_id': { $all: [referredId, referrerId] } }, { projection: { _id: 0, accounts: 1 } }).limit(5).toArray(),
  ])
  const decision = referralRewardDecision({ verified: emailIsVerified(user as Doc | null), graded: !!graded, sameDevice: sharesDevice(prints as never, referredId, referrerId) })
  if (decision === 'wait') return decision
  const { nowIso } = await import('@/lib/db/ids')
  if (decision === 'blocked_same_device') {
    await col.updateOne({ _id: red._id, status: 'pending' }, { $set: { status: 'rejected', rejected_reason: 'same_device', updated_at: nowIso() } })
    return decision
  }
  // Atomic claim: exactly one caller pays.
  const claim = await col.updateOne({ _id: red._id, status: 'pending' }, { $set: { status: 'completed', completed_at: nowIso() } })
  if (claim.modifiedCount !== 1) return 'none'
  const { getGamificationConfig } = await import('@/lib/gamification-config')
  const n = (await getGamificationConfig()).referral.xp_bonus
  const xpAmount = Number.isFinite(n) && n > 0 ? n : 500
  const { awardXpWithLevelUp } = await import('@/lib/xp-service')
  const r = await awardXpWithLevelUp({
    userId: referrerId,
    amount: xpAmount,
    reason: 'referral_earned',
    submissionId: `referral:${referredId}`,
    metadata: { type: 'referral', referred_user_id: referredId, referral_code: String(red.referral_code || '') },
    quiet: true,
  })
  await col.updateOne({ _id: red._id }, { $set: { xp_awarded: r.xpEventId ? xpAmount : 0 } })
  if (r.xpEventId) {
    const { notify } = await import('@/lib/notifications')
    await notify({
      user_id: referrerId,
      type: 'xp.awarded',
      title: `You earned ${xpAmount} XP for a referral`,
      message: 'Someone you invited verified their account and completed their first challenge.',
      title_i18n: { key: 'xp.referral.title', params: { amount: xpAmount } },
      message_i18n: { key: 'xp.referral.message' },
      link: '/dashboard/referrals',
      icon: 'user-plus',
      metadata: { xp: String(xpAmount) },
    }).catch(() => {})
  }
  return 'reward'
}
