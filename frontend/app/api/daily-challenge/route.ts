import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { problems } from '@/lib/db/problems'

export const runtime = 'nodejs'

/**
 * GET /api/daily-challenge
 *
 * Returns the deterministic "problem of the day" for the current UTC date.
 * Algorithm: hash today's YYYY-MM-DD modulo the problem count → pick that
 * problem. Also returns the user's current streak (consecutive days the user
 * has submitted any accepted solution).
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAPIUser()
    const probsCol = await problems()
    const allProblems = await probsCol
      .find({}, { projection: { id: 1, slug: 1, title: 1, difficulty: 1, topics: 1 } })
      .toArray()
    if (allProblems.length === 0) {
      return NextResponse.json({ problem: null, streak: 0, today: todayKey() })
    }

    const today = todayKey()
    const idx = simpleHash(today) % allProblems.length
    const problem = allProblems[idx]

    // Compute the user's streak.
    let streak = 0
    let solvedToday = false
    if (user) {
      const db = await getMongoDb()
      const recent = await db
        .collection('submissions')
        .find(
          { user_id: user.id, status: 'accepted' },
          { projection: { created_at: 1, problem_slug: 1 } },
        )
        .sort({ created_at: -1 })
        .limit(120)
        .toArray()
      const days = new Set<string>()
      for (const s of recent) {
        if (typeof s.created_at === 'string') {
          days.add(s.created_at.slice(0, 10))
        }
      }
      solvedToday = days.has(today)
      let cursor = new Date()
      while (days.has(toKey(cursor))) {
        streak += 1
        cursor.setUTCDate(cursor.getUTCDate() - 1)
      }
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
      { error: 'Internal server error', today: todayKey(), problem: null, streak: 0, solved_today: false },
      { status: 500 },
    )
  }
}

function todayKey(): string {
  return toKey(new Date())
}
function toKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function simpleHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}
