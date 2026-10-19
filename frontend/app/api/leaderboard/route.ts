import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { dicebearUrl } from '@/lib/avatar'
import { xpToLevel } from '@/lib/leaderboard-utils'
import { assignRanks, parseLeaderboardQuery, rankFromAbove } from '@/lib/leaderboard-calc'
import { countAbove, getLeaderboardSnapshot } from '@/lib/leaderboard-cache'
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
    // Cached totals (60 s, one aggregation per category/period) — lib/leaderboard-cache.ts (A-047).
    const snap = await getLeaderboardSnapshot(category, period)
    // Over-fetch a little so users whose account was deleted can be dropped.
    const totals = snap.top.slice(0, limit + 20).map((t) => ({ _id: t.userId, xp: t.xp, solved: t.solved, last: t.last }))

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

    const myXp = snap.byUser.get(gate.user.id) ?? 0
    const above = myXp > 0 ? countAbove(snap.xpDesc, myXp) : 0

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
