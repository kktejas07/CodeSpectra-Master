import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/admin'
import { awardXpWithLevelUp } from '@/lib/xp-service'
import { notify } from '@/lib/notifications'

const DEFAULT_REFERRAL_XP = 500

async function getReferralXp(): Promise<number> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
    const saved = doc?.value as any
    return saved?.referral_xp ?? DEFAULT_REFERRAL_XP
  } catch {
    return DEFAULT_REFERRAL_XP
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const { code } = await request.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Referral code is required' }, { status: 400 })
    }

    const db = await getMongoDb()
    const col = db.collection('referrals')
    const userId = gate.user.id

    const alreadyReferred = await col.findOne({ referred_id: userId })
    if (alreadyReferred) {
      return NextResponse.json({ error: 'You have already been referred' }, { status: 400 })
    }

    const codeDoc = await col.findOne({ referral_code: code.toUpperCase() })
    if (!codeDoc) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
    }

    if (codeDoc.referrer_id === userId) {
      return NextResponse.json({ error: 'You cannot refer yourself' }, { status: 400 })
    }

    const userCol = db.collection('user')
    const referrer = await userCol.findOne({ id: codeDoc.referrer_id })

    await col.updateOne(
      { _id: codeDoc._id },
      {
        $set: {
          referred_id: userId,
          referred_email: gate.user.email,
          status: 'completed',
          completed_at: nowIso(),
        },
      }
    )

    const xpAmount = await getReferralXp()
    const xpResult = await awardXpWithLevelUp({
      userId: codeDoc.referrer_id,
      amount: xpAmount,
      reason: 'admin_grant',
      metadata: { type: 'referral', referred_user_id: userId, referral_code: code.toUpperCase() },
    })

    await notify({
      user_id: codeDoc.referrer_id,
      type: 'xp.awarded',
      title: `You earned ${xpAmount} XP for a referral!`,
      message: `${gate.user.email} signed up using your referral code.`,
      link: '/dashboard/referrals',
      icon: 'user-plus',
      metadata: { xp: String(xpAmount), referred_user: gate.user.email },
    })

    return NextResponse.json({ success: true, xp_awarded: xpAmount })
  } catch (e) {
    console.error('[referral/apply] error:', e)
    return NextResponse.json({ error: 'Failed to apply referral' }, { status: 500 })
  }
}
