import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { getMongoDb } from '@/lib/mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/exams/[id]/rank
 *
 * Returns the calling candidate's percentile rank among all released
 * submissions for this exam.  Called after score release to show
 * "You scored better than X% of all candidates" — a HackerRank-style
 * competitive benchmark that candidates love to share.
 *
 * Response:
 *   { percentile: number, ranked: number, total: number }
 *
 * percentile — 0–100 (rounded), representing the fraction of other
 *              released submissions the caller outscored.
 * ranked     — number of released submissions with a *lower* percent score.
 * total      — total released submissions (including the caller).
 *
 * Returns 204 when fewer than 2 released submissions exist (not enough
 * data to be meaningful).  The UI should silently skip the badge in
 * that case.
 */
export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: examId } = await params

  try {
    const db = await getMongoDb()

    const released = { exam_id: examId, max_score: { $gt: 0 }, $or: [{ score_released: true }, { released_at: { $exists: true, $ne: null } }] }
    const col = db.collection('exam_submissions')

    // The caller's own released submission (latest attempt).
    const mine = await col.findOne(
      { ...released, user_id: gate.user.id },
      { sort: { created_at: -1 }, projection: { _id: 0, score: 1, max_score: 1 } },
    )
    if (!mine || typeof mine.max_score !== 'number') return new NextResponse(null, { status: 204 })
    const myPct = Number(mine.score) / mine.max_score

    // Counted in the database (one small aggregate), not by loading every submission.
    const [agg] = await col.aggregate<{ others: number; ranked: number }>([
      { $match: { ...released, user_id: { $ne: gate.user.id } } },
      { $group: {
        _id: null,
        others: { $sum: 1 },
        ranked: { $sum: { $cond: [{ $lt: [{ $divide: ['$score', '$max_score'] }, myPct] }, 1, 0] } },
      } },
    ]).toArray()
    const others = agg?.others ?? 0
    if (others < 1) {
      // ponytail: not enough data for a meaningful percentile; caller shows nothing
      return new NextResponse(null, { status: 204 })
    }
    const ranked = agg?.ranked ?? 0
    const percentile = Math.round((ranked / others) * 100)

    return NextResponse.json({ percentile, ranked, total: others + 1 })
  } catch (e: unknown) {
    console.error('[CodeSpectra] exams/[id]/rank GET:', e)
    return NextResponse.json(apiErrorFor('server_error'), { status: 500 })
  }
}
