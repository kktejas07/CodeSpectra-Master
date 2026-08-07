import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const body = await req.json().catch(() => ({})) as { quest_id?: string }
  if (!body.quest_id) {
    return NextResponse.json({ error: 'quest_id is required' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const today = todayKey()

    const questsCol = db.collection('daily_quests')
    const doc = await questsCol.findOne({ user_id: userId, date: today })

    if (!doc) {
      return NextResponse.json({ error: 'No quests for today' }, { status: 404 })
    }

    const questIndex = doc.quests.findIndex((q: any) => q.id === body.quest_id)
    if (questIndex === -1) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 })
    }

    const quest = doc.quests[questIndex]
    if (quest.claimed) {
      return NextResponse.json({ error: 'Quest already claimed' }, { status: 400 })
    }
    if (!quest.completed) {
      return NextResponse.json({ error: 'Quest not completed' }, { status: 400 })
    }

    const { awardXpWithLevelUp } = await import('@/lib/xp-service')
    const result = await awardXpWithLevelUp({
      userId,
      amount: quest.xp_reward,
      reason: 'daily_login',
      metadata: { quest_id: quest.id, quest_type: quest.type, daily_quest: true },
    })

    doc.quests[questIndex].claimed = true
    await questsCol.updateOne(
      { _id: doc._id },
      { $set: { quests: doc.quests } }
    )

    return NextResponse.json({
      claimed: true,
      xp_awarded: result.xp,
      level: result.level,
      leveled_up: result.leveledUp,
    })
  } catch (error) {
    console.error('[daily-quests] claim error:', error)
    return NextResponse.json({ error: 'Failed to claim quest reward' }, { status: 500 })
  }
}
