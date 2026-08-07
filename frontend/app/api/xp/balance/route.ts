import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getUserXp } from '@/lib/db/leaderboard'
import { xpToLevel } from '@/lib/leaderboard-utils'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

function getXpForNextLevel(currentLevel: number): number {
  return Math.pow((currentLevel + 1), 2) * 40
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

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const userId = gate.user.id
    const totalXp = await getUserXp(userId)
    const level = xpToLevel(totalXp)
    const xpToNext = getXpForNextLevel(level)
    const redeemRate = await getRedeemRate()

    return NextResponse.json({
      total_xp: totalXp,
      level,
      xp_to_next_level: xpToNext,
      can_redeem: totalXp >= redeemRate,
      redeem_rate: redeemRate,
    })
  } catch (error) {
    console.error('[xp-balance] error:', error)
    return NextResponse.json({ error: 'Failed to fetch XP balance' }, { status: 500 })
  }
}
