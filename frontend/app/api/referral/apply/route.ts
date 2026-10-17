import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/admin'
import { awardXpWithLevelUp } from '@/lib/xp-service'
import { notify } from '@/lib/notifications'
import { isReferralEligible, normaliseReferralCode, REFERRAL_WINDOW_DAYS } from '@/lib/referral-rules'
import { limitRequest } from '@/lib/rate-limit'

const DEFAULT_REFERRAL_XP = 500

async function getReferralXp(): Promise<number> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
    const saved = doc?.value as any
    const n = Number(saved?.referral_xp ?? saved?.referral?.xp_bonus ?? DEFAULT_REFERRAL_XP)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_REFERRAL_XP
  } catch {
    return DEFAULT_REFERRAL_XP
  }
}

// One redemption per referred user, enforced by a partial unique index.
let indexReady: Promise<void> | null = null
function ensureIndex(db: Awaited<ReturnType<typeof getMongoDb>>): Promise<void> {
  if (!indexReady) {
    indexReady = db
      .collection('referrals')
      .createIndex(
        { referred_id: 1 },
        { unique: true, name: 'referred_id_unique', partialFilterExpression: { kind: 'redemption' } },
      )
      .then(() => undefined)
      .catch((e) => {
        console.warn('[referral/apply] unique index not created:', e?.message)
      })
  }
  return indexReady
}

/**
 * POST /api/referral/apply { code }
 *
 * The code row (`referrer_id`, `referral_code`, `referred_id: ''`) is never
 * modified. Each redemption is its own row (`kind: 'redemption'`), one per
 * referred user, and only accounts created in the last REFERRAL_WINDOW_DAYS
 * days can redeem. XP is keyed on the referred user, so it can't repeat.
 */
export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const limited = await limitRequest(request, 'referral-apply', gate.user.id, 5, 10 * 60_000)
  if (limited) return limited

  try {
    const body = await request.json().catch(() => ({}))
    const code = normaliseReferralCode((body as any)?.code)
    if (!code) {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    await ensureIndex(db)
    const col = db.collection('referrals')
    const userId = gate.user.id

    const alreadyReferred = await col.findOne({ referred_id: userId })
    if (alreadyReferred) {
      return NextResponse.json({ error: 'You have already used a referral code' }, { status: 400 })
    }

    const me = await db.collection('user').findOne({ id: userId }, { projection: { createdAt: 1, created_at: 1, name: 1, fullName: 1 } })
    if (!isReferralEligible(me?.createdAt ?? me?.created_at, new Date())) {
      return NextResponse.json(
        { error: `Referral codes can only be used within ${REFERRAL_WINDOW_DAYS} days of signing up` },
        { status: 400 },
      )
    }

    const codeDoc = await col.findOne({ referral_code: code, kind: { $ne: 'redemption' } })
    if (!codeDoc || !codeDoc.referrer_id) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }
    if (codeDoc.referrer_id === userId) {
      return NextResponse.json({ error: 'You cannot refer yourself' }, { status: 400 })
    }

    const xpAmount = await getReferralXp()
    const redemptionId = newId()
    try {
      await col.insertOne({
        id: redemptionId,
        kind: 'redemption',
        referrer_id: codeDoc.referrer_id,
        referred_id: userId,
        referred_email: gate.user.email,
        referral_code: code,
        status: 'completed',
        xp_awarded: xpAmount,
        commission_earned: 0,
        created_at: nowIso(),
        completed_at: nowIso(),
        commissioned_at: null,
      })
    } catch (e: any) {
      if (e?.code === 11000) {
        return NextResponse.json({ error: 'You have already used a referral code' }, { status: 400 })
      }
      throw e
    }

    // Deduped per referred user by awardXp's (user, submission_id, reason) check.
    const xpResult = await awardXpWithLevelUp({
      userId: codeDoc.referrer_id,
      amount: xpAmount,
      reason: 'referral_earned',
      submissionId: `referral:${userId}`,
      metadata: { type: 'referral', referred_user_id: userId, referral_code: code },
      quiet: true,
    })
    if (!xpResult.xpEventId) {
      await col.updateOne({ id: redemptionId }, { $set: { xp_awarded: 0 } })
    }

    const who = String(me?.fullName || me?.name || 'Someone')
    await notify({
      user_id: codeDoc.referrer_id,
      type: 'xp.awarded',
      title: `You earned ${xpAmount} XP for a referral`,
      message: `${who} signed up with your referral code.`,
      link: '/dashboard/referrals',
      icon: 'user-plus',
      metadata: { xp: String(xpAmount) },
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[referral/apply] error:', e)
    return NextResponse.json({ error: 'Failed to apply referral' }, { status: 500 })
  }
}
