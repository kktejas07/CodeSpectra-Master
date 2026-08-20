import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()
    
    // Fetch top 3 users by points
    const topUsers = await db.collection('users')
      .find({ points: { $exists: true } })
      .sort({ points: -1 })
      .limit(3)
      .project({ _id: 0, id: 1, name: 1, points: 1, email: 1 })
      .toArray()
      
    // Fetch current user rank
    const currentUser = await db.collection('users').findOne({ id: gate.user.id })
    let currentUserRank = 0
    let currentUserPoints = 0
    
    if (currentUser) {
      currentUserPoints = currentUser.points || 0
      // Count how many users have more points
      const betterUsers = await db.collection('users').countDocuments({
        points: { $gt: currentUserPoints }
      })
      currentUserRank = betterUsers + 1
    }

    return NextResponse.json({
      leaderboard: topUsers,
      currentUser: {
        points: currentUserPoints,
        rank: currentUserRank
      }
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
