import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { problems } from '@/lib/db/problems'
import { getUserStreak } from '@/lib/activity-streak'
import { dailyIndex, todayKey } from '@/lib/pwa/offline-payload'

export const runtime = 'nodejs'

/**
 * GET /api/daily-challenge
 *
 * Returns the deterministic "problem of the day" for the current UTC date.
 * Algorithm: hash today's YYYY-MM-DD modulo the problem count → pick that
 * problem (published practice problems only — never hackathon problems).
 * Also returns the user's current streak (consecutive days with an accepted
 * solution; see lib/streak.ts — the same number as /api/user/stats).
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAPIUser()
    const probsCol = await problems()
    const allProblems = await probsCol
      .find(
        { is_published: true, hackathon_id: null, visibility: { $ne: 'hackathon_only' } },
        { projection: { id: 1, slug: 1, title: 1, difficulty: 1, topics: 1 } },
      )
      .sort({ id: 1 })
      .toArray()
    if (allProblems.length === 0) {
      return NextResponse.json({ problem: null, streak: 0, today: todayKey() })
    }

    const today = todayKey()
    const idx = dailyIndex(today, allProblems.length)
    const problem = allProblems[idx]

    // Compute the user's streak.
    let streak = 0
    let solvedToday = false
    if (user) {
      const st = await getUserStreak(user.id)
      streak = st.current
      solvedToday = st.activeToday
    }

    return NextResponse.json({
      today,
      problem: {
        slug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        topics: problem.topics,
      },
      streak,
      solved_today: solvedToday,
    })
  } catch (error) {
    console.error('[CodeSpectra] daily-challenge error:', error)
    return NextResponse.json(
      { error: 'Internal server error', code: 'internal_error', today: todayKey(), problem: null, streak: 0, solved_today: false },
      { status: 500 },
    )
  }
}
