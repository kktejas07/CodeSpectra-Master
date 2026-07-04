import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    const userId = gate.user.id

    const [scanCount, reviewCount, fixCount, integrationCount, submissionCount, userDoc] = await Promise.all([
      db.collection('scan_comments').countDocuments({ user_id: userId }),
      db.collection('code_review_comments').countDocuments({ user_id: userId }),
      db.collection('suggested_fixes').countDocuments({ user_id: userId }),
      db.collection('integrations').countDocuments({ user_id: userId }),
      db.collection('submissions').countDocuments({ user_id: userId }),
      db.collection('user').findOne({ id: userId }).catch(() => ({})),
    ])

    const dailyChallengeCount = await db.collection('daily_challenges').countDocuments({ user_id: userId, completedAt: { $exists: true } })

    const streakPipeline = [
      { $match: { user_id: userId, completedAt: { $exists: true } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } } } },
      { $sort: { _id: -1 } },
    ]
    const streakDays = await db.collection('daily_challenges').aggregate(streakPipeline).toArray()

    let streak = 0
    const today = new Date().toISOString().slice(0, 10)
    let checkDate = today
    for (const day of streakDays) {
      if (day._id === checkDate) {
        streak++
        const d = new Date(checkDate)
        d.setDate(d.getDate() - 1)
        checkDate = d.toISOString().slice(0, 10)
      } else if (day._id < checkDate) {
        break
      }
    }

    const createdAt = userDoc?.createdAt || userDoc?.created_at

    return NextResponse.json({
      scans: scanCount,
      reviews: reviewCount,
      fixes: fixCount,
      integrations: integrationCount,
      challenges: submissionCount,
      dailyChallenges: dailyChallengeCount,
      streak,
      memberSince: createdAt ? new Date(createdAt).toISOString() : null,
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching user stats:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}