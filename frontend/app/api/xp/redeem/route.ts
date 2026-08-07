import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { awardXp, getUserXp } from '@/lib/db/leaderboard'

export const dynamic = 'force-dynamic'

function generateDiscountCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = 'XP-'
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

async function getRedeemRate(): Promise<number> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'gamification' })
    const stored = doc?.value as any
    return stored?.xp_redeem_rate ?? 1000
  } catch {
    return 1000
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as { plan?: string; months?: number }
  if (!body.plan || !['pro', 'enterprise'].includes(body.plan)) {
    return NextResponse.json({ error: 'plan must be "pro" or "enterprise"' }, { status: 400 })
  }
  if (!body.months || body.months < 1 || body.months > 12) {
    return NextResponse.json({ error: 'months must be between 1 and 12' }, { status: 400 })
  }

  try {
    const userId = gate.user.id
    const redeemRate = await getRedeemRate()
    const totalCost = redeemRate * body.months

    const currentXp = await getUserXp(userId)
    if (currentXp < totalCost) {
      return NextResponse.json({
        error: `Insufficient XP. Need ${totalCost}, have ${currentXp}`,
        xp_needed: totalCost - currentXp,
      }, { status: 400 })
    }

    await awardXp({
      userId,
      amount: -totalCost,
      reason: 'xp_redeemed' as any,
      metadata: { plan: body.plan, months: body.months, discount_code: generateDiscountCode() },
    })

    const db = await getMongoDb()
    const code = generateDiscountCode()
    await db.collection('discount_codes').insertOne({
      code,
      user_id: userId,
      plan: body.plan,
      months: body.months,
      xp_used: totalCost,
      is_used: false,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({
      discount_code: code,
      xp_used: totalCost,
      months: body.months,
    })
  } catch (error) {
    console.error('[xp-redeem] error:', error)
    return NextResponse.json({ error: 'Failed to redeem XP' }, { status: 500 })
  }
}
