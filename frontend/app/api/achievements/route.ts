import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { xpToLevel } from '@/lib/leaderboard-utils'
import { getGamificationConfig } from '@/lib/gamification-config'

/**
 * GET /api/achievements
 *
 * Returns the current user's achievements computed live from real activity
 * (xp_events, submissions, certifications, codeathon registrations) instead
 * of static seed data, plus their XP total and display level.
 */
export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const xpAgg = await db
      .collection('xp_events')
      .aggregate<{ total: number }>([
        { $match: { user_id: userId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .toArray()
    const totalXp = xpAgg[0]?.total ?? 0
    const level = xpToLevel(totalXp, (await getGamificationConfig()).levels)

    const solvedCount = await db.collection('submissions').countDocuments({ user_id: userId, status: 'accepted' })
    const hasReason = async (reason: string) => Boolean(await db.collection('xp_events').findOne({ user_id: userId, reason }))

    const [firstBlood, certPassed, examPassed, codeathon] = await Promise.all([
      hasReason('first_blood'),
      hasReason('certification_passed'),
      hasReason('exam_passed'),
      hasReason('codeathon_attended'),
    ])

    const achievements = [
      { id: 1, name: 'First Victory', description: 'Solve your first problem', icon: 'Trophy', earned: solvedCount >= 1, progress: Math.min(solvedCount, 1), total: 1 },
      { id: 2, name: 'Speed Runner', description: 'Solve 10 problems', icon: 'Zap', earned: solvedCount >= 10, progress: Math.min(solvedCount, 10), total: 10 },
      { id: 3, name: 'Problem Solver', description: 'Solve 5 problems', icon: 'Target', earned: solvedCount >= 5, progress: Math.min(solvedCount, 5), total: 5 },
      { id: 4, name: 'XP Grinder', description: 'Earn 100 XP', icon: 'Flame', earned: totalXp >= 100, progress: Math.min(totalXp, 100), total: 100 },
      { id: 5, name: 'Level Climber', description: 'Reach Level 3', icon: 'Trophy', earned: level >= 3, progress: Math.min(level, 3), total: 3 },
      { id: 6, name: 'First Blood', description: 'Be the first to solve a problem', icon: 'Code2', earned: firstBlood, progress: firstBlood ? 1 : 0, total: 1 },
      { id: 7, name: 'Certified', description: 'Earn a certification', icon: 'BookOpen', earned: certPassed, progress: certPassed ? 1 : 0, total: 1 },
      { id: 8, name: 'Exam Champion', description: 'Pass an exam', icon: 'Target', earned: examPassed, progress: examPassed ? 1 : 0, total: 1 },
      { id: 9, name: 'Competitor', description: 'Join a codeathon', icon: 'Flame', earned: codeathon, progress: codeathon ? 1 : 0, total: 1 },
    ]

    return NextResponse.json({
      data: achievements,
      xp: totalXp,
      level,
      stats: { solved: solvedCount },
    })
  } catch (e) {
    console.error('[achievements] error:', e)
    return NextResponse.json({ error: 'Failed', code: 'failed' }, { status: 500 })
  }
}
