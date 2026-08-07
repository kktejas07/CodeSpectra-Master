import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { awardXpWithLevelUp } from '@/lib/xp-service'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as { user_id?: string; amount?: number; reason?: string }
  if (!body.user_id) {
    return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
  }
  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 })
  }
  if (!body.reason) {
    return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const user = await db.collection('user').findOne({ id: body.user_id })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const result = await awardXpWithLevelUp({
      userId: body.user_id,
      amount: body.amount,
      reason: 'admin_grant',
      metadata: { granted_by: gate.user.id, reason: body.reason },
    })

    return NextResponse.json({
      granted: true,
      user_id: body.user_id,
      amount: body.amount,
      new_total_xp: result.xp,
      level: result.level,
      leveled_up: result.leveledUp,
    })
  } catch (error) {
    console.error('[admin-xp-grant] error:', error)
    return NextResponse.json({ error: 'Failed to grant XP' }, { status: 500 })
  }
}
