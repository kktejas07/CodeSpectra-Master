import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { getUserXp } from '@/lib/db/leaderboard'
import { getUserStreak } from '@/lib/activity-streak'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const [scanCount, reviewCount, fixCount, integrationCount, submissionCount, solvedIds, xp, streak, userDoc] =
      await Promise.all([
        db.collection('code_scans').countDocuments({ user_id: userId }),
        db.collection('code_review_comments').countDocuments({ user_id: userId }),
        db.collection('suggested_fixes').countDocuments({ user_id: userId }),
        db.collection('integrations').countDocuments({ user_id: userId }),
        db.collection('submissions').countDocuments({ user_id: userId }),
        db.collection('submissions').distinct('problem_id', { user_id: userId, status: 'accepted' }),
        getUserXp(userId),
        getUserStreak(userId),
        db.collection('user').findOne({ id: userId }, { projection: { createdAt: 1, created_at: 1 } }).catch(() => null),
      ])

    const createdAt = (userDoc as any)?.createdAt || (userDoc as any)?.created_at

    return NextResponse.json({
      scans: scanCount,
      reviews: reviewCount,
      fixes: fixCount,
      integrations: integrationCount,
      // Distinct problems with an accepted submission.
      challenges: solvedIds.length,
      solved: solvedIds.length,
      submissions: submissionCount,
      // Days on which at least one practice problem was solved.
      dailyChallenges: streak.days.length,
      streak: streak.current,
      longestStreak: streak.longest,
      activeToday: streak.activeToday,
      xp,
      memberSince: createdAt ? new Date(createdAt).toISOString() : null,
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching user stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
