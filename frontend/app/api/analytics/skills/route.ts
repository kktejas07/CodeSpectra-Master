import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

/**
 * GET /api/analytics/skills — Returns aggregated submission stats for the
 * current user along with an AI-generated growth plan.
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = await getMongoDb()
  const subs = await db
    .collection('submissions')
    .find({ user_id: user.id })
    .sort({ created_at: -1 })
    .limit(120)
    .toArray()

  // Build aggregates.
  const total = subs.length
  const accepted = subs.filter((s) => s.status === 'accepted').length
  const byLang = countBy(subs, (s) => String(s.language || 'unknown'))
  const byDifficulty = countBy(subs, (s) => String(s.difficulty || 'unknown'))
  const avgScore =
    total === 0
      ? 0
      : Math.round(
          subs.reduce((acc, s) => acc + (typeof s.score === 'number' ? s.score : 0), 0) / total,
        )
  const avgTime =
    total === 0
      ? 0
      : Math.round(
          subs.reduce((acc, s) => acc + (typeof s.total_time_ms === 'number' ? s.total_time_ms : 0), 0) /
            total,
        )

  const summary = subs.slice(0, 40).map((s) => ({
    problem: s.problem_slug || s.problem_title || 'unknown',
    difficulty: s.difficulty || 'unknown',
    passed: s.passed_tests ?? null,
    total: s.total_tests ?? null,
    time_ms: s.total_time_ms ?? null,
    language: s.language || null,
    score: s.score ?? null,
  }))

  let aiInsights: Record<string, unknown> | null = null
  if (total >= 3) {
    try {
      aiInsights = await backendPost<Record<string, unknown>>(
        '/internal/ai/skill-insights',
        {
          user_name: user.email,
          submissions_summary: summary,
        },
      )
    } catch (e) {
      console.error('[analytics/skills] ai err:', e)
    }
  }

  return NextResponse.json({
    user: { email: user.email, id: user.id },
    totals: {
      submissions: total,
      accepted,
      accuracy_pct: total === 0 ? 0 : Math.round((accepted / total) * 100),
      avg_score: avgScore,
      avg_time_ms: avgTime,
    },
    by_language: byLang,
    by_difficulty: byDifficulty,
    recent: summary.slice(0, 10),
    ai_insights: aiInsights,
  })
}

function countBy<T>(arr: T[], pick: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const x of arr) {
    const k = pick(x)
    out[k] = (out[k] || 0) + 1
  }
  return out
}
