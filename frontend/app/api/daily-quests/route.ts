import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import type { Db } from 'mongodb'

export const dynamic = 'force-dynamic'

const QUEST_POOL = [
  { type: 'solve_problems', title: 'Solve 3 problems', description: 'Solve 3 problems today', xp_reward: 30, target: 3 },
  { type: 'pass_exam', title: 'Pass an exam', description: 'Pass an exam today', xp_reward: 50, target: 1 },
  { type: 'daily_login', title: 'Log in today', description: 'Log in to the platform', xp_reward: 5, target: 1 },
  { type: 'earn_xp', title: 'Earn 50 XP today', description: 'Earn 50 XP from any activity', xp_reward: 20, target: 50 },
  { type: 'streak_maintain', title: 'Maintain your streak', description: 'Keep your daily streak alive', xp_reward: 15, target: 1 },
  { type: 'submit_code', title: 'Submit code to a problem', description: 'Submit any solution attempt', xp_reward: 10, target: 1 },
  { type: 'visit_leaderboard', title: 'Check the leaderboard', description: 'Visit the leaderboard page', xp_reward: 5, target: 1 },
  { type: 'view_certifications', title: 'Browse certifications', description: 'View available certifications', xp_reward: 5, target: 1 },
]

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function pickRandomQuests(date: string, userId: string, count: number) {
  const shuffled = [...QUEST_POOL].sort((a, b) => {
    let ha = 0
    for (let i = 0; i < (date + userId + a.type).length; i++) ha = (ha * 31 + (date + userId + a.type).charCodeAt(i)) | 0
    let hb = 0
    for (let i = 0; i < (date + userId + b.type).length; i++) hb = (hb * 31 + (date + userId + b.type).charCodeAt(i)) | 0
    return Math.abs(ha) - Math.abs(hb)
  })
  return shuffled.slice(0, count).map((q, i) => ({
    id: `${date}-${i}-${q.type}`,
    type: q.type,
    title: q.title,
    description: q.description,
    xp_reward: q.xp_reward,
    target: q.target,
    progress: 0,
    completed: false,
    claimed: false,
  }))
}

async function computeProgress(userId: string, questType: string, db: Db): Promise<number> {
  const todayStart = startOfDay(new Date()).toISOString()

  switch (questType) {
    case 'solve_problems': {
      const col = db.collection('submissions')
      const count = await col.countDocuments({
        user_id: userId,
        status: 'accepted',
        created_at: { $gte: todayStart },
      })
      return count
    }
    case 'pass_exam': {
      const col = db.collection('exam_submissions')
      const todaySubmissions = await col.find({
        user_id: userId,
        created_at: { $gte: todayStart },
      }).toArray()
      return todaySubmissions.filter((s: any) => s.score > 0 && s.max_score > 0 && (s.score / s.max_score) >= 0.5).length
    }
    case 'daily_login': {
      return 1
    }
    case 'earn_xp': {
      const col = db.collection('xp_events')
      const agg = await col.aggregate<{ _id: null; total: number }>([
        { $match: { user_id: userId, created_at: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).toArray()
      return agg[0]?.total ?? 0
    }
    case 'streak_maintain': {
      const streakDoc = await db.collection('user_streaks').findOne({ user_id: userId })
      if (!streakDoc) return 0
      const lastLogin = streakDoc.last_login_at ? new Date(streakDoc.last_login_at) : null
      if (!lastLogin) return 0
      const diffMs = Date.now() - startOfDay(lastLogin).getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      if (diffDays > 1.083) return 0
      return streakDoc.streak > 0 ? 1 : 0
    }
    case 'submit_code': {
      const col = db.collection('submissions')
      const count = await col.countDocuments({
        user_id: userId,
        created_at: { $gte: todayStart },
      })
      return count
    }
    case 'visit_leaderboard': {
      return 1
    }
    case 'view_certifications': {
      return 1
    }
    default:
      return 0
  }
}

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id
    const today = todayKey()

    const questsCol = db.collection('daily_quests')
    let doc = await questsCol.findOne({ user_id: userId, date: today })

    if (!doc) {
      const quests = pickRandomQuests(today, userId, 3)
      const insertDoc = {
        user_id: userId,
        date: today,
        quests,
        created_at: new Date().toISOString(),
      }
      await questsCol.insertOne(insertDoc as any)
      doc = await questsCol.findOne({ user_id: userId, date: today })
    }

    if (!doc) {
      return NextResponse.json({ error: 'Failed to load quests' }, { status: 500 })
    }

    const updatedQuests = await Promise.all(
      (doc.quests || []).map(async (q: any) => {
        if (q.claimed) return q
        const progress = await computeProgress(userId, q.type, db)
        const completed = progress >= q.target
        return { ...q, progress: Math.min(progress, q.target), completed }
      })
    )

    await questsCol.updateOne(
      { _id: doc._id },
      { $set: { quests: updatedQuests } }
    )

    return NextResponse.json({
      quests: updatedQuests,
      date: today,
    })
  } catch (error) {
    console.error('[daily-quests] GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch daily quests' }, { status: 500 })
  }
}
