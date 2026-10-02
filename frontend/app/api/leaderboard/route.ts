import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { dicebearUrl } from '@/lib/avatar'
import type { LeaderboardEntryDTO } from '@/lib/leaderboard-types'

const LIMIT = 80

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const db = await getMongoDb()

    // ponytail: single collection scan sorted by points; rank = sort position.
    // Categories (Female/Engineering/etc.) need profile fields we don't store yet.
    const topUsers = await db.collection('user')
      .find({ points: { $gt: 0 } })
      .sort({ points: -1 })
      .limit(LIMIT)
      .project({ _id: 0, id: 1, name: 1, fullName: 1, email: 1, points: 1, avatarUrl: 1 })
      .toArray()

    const entries: LeaderboardEntryDTO[] = topUsers.map((u, i) => ({
      rank: i + 1,
      userId: String(u.id ?? ''),
      name: String(u.fullName || u.name || u.email || 'Anonymous'),
      title: 'CodeSpectra Learner',
      level: Math.max(1, Math.floor((Number(u.points) || 0) / 1000) + 1),
      xp: Number(u.points) || 0,
      language: '—',
      languageClass: 'text-muted-foreground',
      avatar:
        String(u.avatarUrl || '') || dicebearUrl(String(u.id || u.email || i)),
      lastSubmission: null,
      streak: 0,
      challengesSolved: 0,
    }))

    const currentUser = await db.collection('user').findOne({ id: gate.user.id })
    const currentUserPoints = Number(currentUser?.points) || 0
    const betterUsers =
      currentUserPoints > 0
        ? await db.collection('user').countDocuments({ points: { $gt: currentUserPoints } })
        : 0
    const currentUserRank = currentUserPoints > 0 ? betterUsers + 1 : null

    return NextResponse.json({
      entries,
      currentUser: {
        points: currentUserPoints,
        rank: currentUserRank,
      },
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
