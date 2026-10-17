import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import type { IdRouteContext } from '@/lib/app-route-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET — per-question grading aggregates for the results charts.
 * avgPct is computed over GRADED answers only (awarded set); ungraded
 * pending_review answers are counted separately so a half-graded exam
 * doesn't masquerade as a hard question.
 */
export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId } = await params

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    const exam = owned.doc as Record<string, any>

    const questions: Array<{ id: string; title: string; type: string; max: number }> = (
      Array.isArray(exam.questionList) ? exam.questionList : []
    ).map((q: any) => ({
      id: String(q.id),
      title: String(q.title || q.prompt || 'Question').slice(0, 80),
      type: String(q.type || ''),
      max: Number(q.points ?? q.score) || 10,
    }))

    const submissions = await db
      .collection('exam_submissions')
      .find({ exam_id: examId })
      .project({ details: 1 })
      .toArray()

    const stats = questions.map((q) => {
      let sum = 0
      let graded = 0
      let answered = 0
      for (const sub of submissions) {
        const d = (sub.details || []).find((x: any) => x.qId === q.id)
        if (!d) continue
        if (String(d.answer || '').trim()) answered++
        if (typeof d.awarded === 'number') {
          graded++
          sum += Math.max(0, Math.min(q.max, d.awarded))
        } else if (d.correct && !d.pending_review) {
          graded++
          sum += q.max
        }
      }
      return {
        ...q,
        avgPct: graded > 0 ? Math.round((sum / (graded * q.max)) * 100) : null,
        graded,
        answered,
        total: submissions.length,
      }
    })

    return NextResponse.json({ data: stats, submissions: submissions.length })
  } catch (e: unknown) {
    const msg = 'Failed to load question stats'
    console.error('[CodeSpectra] question-stats GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
