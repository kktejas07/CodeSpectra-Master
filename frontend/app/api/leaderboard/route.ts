import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { dicebearUrl } from '@/lib/avatar'
import { xpToLevel } from '@/lib/leaderboard-utils'
import { assignRanks, buildXpMatch, parseLeaderboardQuery, rankFromAbove } from '@/lib/leaderboard-calc'
import type { LeaderboardEntryDTO } from '@/lib/leaderboard-types'

/**
 * GET /api/leaderboard?category=global|practice|hackathon|exams&period=all|month&limit=80
 *
 * Ranks users by XP summed from `xp_events` (the only place XP is written).
 * Never returns emails.
 */
export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  try {
    const { category, period, limit } = parseLeaderboardQuery(new URL(req.url).searchParams)
    const db = await getMongoDb()
    const xp = db.collection('xp_events')
    const baseMatch = buildXpMatch(category, period, new Date())

    // Over-fetch a little so users whose account was deleted can be dropped.
    const totals = await xp
      .aggregate<{ _id: string; xp: number; solved: number; last: string | null }>([
        { $match: baseMatch },
        {
          $group: {
            _id: '$user_id',
            xp: { $sum: '$amount' },
            solved: { $sum: { $cond: [{ $eq: ['$reason', 'submission_accepted'] }, 1, 0] } },
            last: { $max: '$created_at' },
          },
        },
        { $match: { xp: { $gt: 0 } } },
        { $sort: { xp: -1, _id: 1 } },
        { $limit: limit + 20 },
      ])
      .toArray()

    const ids = totals.map((t) => String(t._id))
    const users = ids.length
      ? await db
          .collection('user')
          .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, name: 1, fullName: 1, avatarUrl: 1 } })
          .toArray()
      : []
    const byId = new Map(users.map((u) => [String(u.id), u]))

    const ranked = assignRanks(
      totals
        .filter((t) => byId.has(String(t._id)))
        .map((t) => ({ userId: String(t._id), xp: Number(t.xp) || 0, solved: t.solved, last: t.last })),
    ).slice(0, limit)

    const entries: LeaderboardEntryDTO[] = ranked.map((r) => {
      const u = byId.get(r.userId)!
      const level = xpToLevel(r.xp)
      return {
        rank: r.rank,
        userId: r.userId,
        name: String(u.fullName || u.name || 'Learner'),
        title: `Level ${level}`,
        level,
        xp: r.xp,
        avatar: String(u.avatarUrl || '') || dicebearUrl(r.userId),
        lastActivity: r.last ? String(r.last) : null,
        challengesSolved: Number(r.solved) || 0,
      }
    })

    const me = await xp
      .aggregate<{ total: number }>([
        { $match: { ...baseMatch, user_id: gate.user.id } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ])
      .toArray()
    const myXp = Number(me[0]?.total) || 0
    let above = 0
    if (myXp > 0) {
      const cnt = await xp
        .aggregate<{ n: number }>([
          { $match: baseMatch },
          { $group: { _id: '$user_id', xp: { $sum: '$amount' } } },
          { $match: { xp: { $gt: myXp } } },
          { $count: 'n' },
        ])
        .toArray()
      above = cnt[0]?.n ?? 0
    }

    return NextResponse.json({
      category,
      period,
      entries,
      currentUser: { points: myXp, rank: rankFromAbove(myXp, above) },
    })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching leaderboard:', error)
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
