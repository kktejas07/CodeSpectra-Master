import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/admin'

const DEFAULT_COMMISSION_PERCENT = 10

async function getCommissionPercent(): Promise<number> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
    const saved = doc?.value as any
    return saved?.referral_commission_percent ?? DEFAULT_COMMISSION_PERCENT
  } catch {
    return DEFAULT_COMMISSION_PERCENT
  }
}

export async function POST(request: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  if (gate.user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { referral_id, amount_paise } = await request.json()
    if (!referral_id || typeof referral_id !== 'string') {
      return NextResponse.json({ error: 'referral_id is required' }, { status: 400 })
    }
    if (typeof amount_paise !== 'number' || amount_paise <= 0) {
      return NextResponse.json({ error: 'amount_paise must be a positive number' }, { status: 400 })
    }

    const db = await getMongoDb()
    const col = db.collection('referrals')
    const refDoc = await col.findOne({ id: referral_id })
    if (!refDoc) {
      return NextResponse.json({ error: 'Referral not found' }, { status: 404 })
    }

    const percent = await getCommissionPercent()
    const commission = Math.floor(amount_paise * (percent / 100))

    await col.updateOne(
      { _id: refDoc._id },
      {
        $set: {
          status: 'commissioned',
          commission_earned: commission,
          commissioned_at: nowIso(),
        },
      }
    )

    return NextResponse.json({ success: true, commission_earned: commission, percent })
  } catch (e) {
    console.error('[referral/commission] error:', e)
    return NextResponse.json({ error: 'Failed to process commission' }, { status: 500 })
  }
}
