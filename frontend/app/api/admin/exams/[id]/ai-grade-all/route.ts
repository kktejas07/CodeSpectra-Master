import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { gradeAnswer, GradeRateLimitedError, OBJECTIVE_TYPES } from '@/lib/ai/grade-question'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Pace = one LLM call per >1s so we stay under the backend 60 req/min cap. */
const LLM_PACE_MS = 1100

/**
 * POST — Bulk AI-grade all pending questions for one or many candidates.
 * Objective questions grade deterministically (no LLM cost); free-text answers
 * use the configured LLM. Grades + feedback are persisted to exam_submissions
 * so the admin never has to open each candidate's review to finish grading.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId } = await params
  const body = await req.json().catch(() => ({})) as {
    userIds?: string[]
    includeAnswered?: boolean
  }

  const userIds = Array.isArray(body.userIds) && body.userIds.length > 0 ? body.userIds : null

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const exam = owned.doc

    const questions = Array.isArray(exam.questionList) ? exam.questionList : (Array.isArray(exam.questions) ? exam.questions : [])

    const submissionQuery: Record<string, unknown> = { exam_id: examId }
    if (userIds) submissionQuery.user_id = { $in: userIds }
    const submissions = await db.collection('exam_submissions').find(submissionQuery).toArray()
    if (submissions.length === 0) {
      return NextResponse.json({ error: 'No submissions found to grade' }, { status: 404 })
    }

    const results: Array<{ userId: string; graded: number; failed: string[] }> = []
    let totalGraded = 0
    let totalFailed = 0

    for (const submission of submissions) {
      const userId = submission.user_id
      const details = (submission.details || []) as Array<{
        qId: string; correct: boolean; points: number; answer: string; pending_review?: boolean; awarded?: number; remarks?: string; requires_human_review?: boolean; confidence?: number; jev_agree?: boolean | null; jev_confidence?: number | null; graded_by?: string | null
      }>
      const answers = (submission.answers || {}) as Record<string, string>
      const failList: string[] = []

      const updatedDetails: typeof details = []
      let gradedInSub = 0
      for (const d of details) {
        const isPending = d.pending_review === true
        const needsGrade = isPending || (d.awarded === undefined && !d.correct && (body.includeAnswered ? !!answers[d.qId] : false))
        const q = questions.find((x: any) => x.id === d.qId)
        const answer = String(answers[d.qId] || '').trim()

        if (needsGrade && q && answer) {
          // Objective questions are deterministic (no LLM) so only pace the free-text ones.
          const isObjective = OBJECTIVE_TYPES.includes((q.type || '').toLowerCase())
          let res: Awaited<ReturnType<typeof gradeAnswer>> | null = null
          try {
            res = await gradeAnswer({
              questionText: q.prompt || q.question || q.title || 'Question',
              candidateAnswer: answer,
              modelAnswer: String(q.answer || q.correct_answer || '').trim(),
              type: q.type || '',
              maxPoints: q.points || q.score || d.points || 10,
              options: Array.isArray(q.options) ? q.options.map(String) : undefined,
              testCases: q.test_cases || q.testCases,
            })
          } catch (e: unknown) {
            // Wait out a rate limit (60 req/min) then retry once; otherwise fail this question.
            if (e instanceof GradeRateLimitedError) {
              const backoff = Math.max(1, Math.min(60, (e as any).retryAfterSec || 60))
              await sleep(backoff * 1000 + 500)
              try {
                res = await gradeAnswer({
                  questionText: q.prompt || q.question || q.title || 'Question',
                  candidateAnswer: answer,
                  modelAnswer: String(q.answer || q.correct_answer || '').trim(),
                  type: q.type || '',
                  maxPoints: q.points || q.score || d.points || 10,
                  options: Array.isArray(q.options) ? q.options.map(String) : undefined,
                  testCases: q.test_cases || q.testCases,
                })
              } catch (e2) {
                failList.push(d.qId)
                totalFailed++
                updatedDetails.push(d)
                continue
              }
            } else {
              failList.push(d.qId)
              totalFailed++
              updatedDetails.push(d)
              continue
            }
          }
          if (res) {
            updatedDetails.push({
              ...d,
              awarded: res.recommended,
              correct: res.recommended > 0,
              pending_review: !!res.requires_human_review,
              remarks: res.feedback,
              requires_human_review: res.requires_human_review,
              confidence: res.confidence,
              jev_agree: res.jev_agree ?? null,
              jev_confidence: res.jev_confidence ?? null,
              graded_by: res.graded_by ?? null,
            })
            totalGraded++
            gradedInSub++
          }
          if (!isObjective) await sleep(LLM_PACE_MS)
        } else {
          updatedDetails.push(d)
        }
      }

      let newScore = 0
      let stillPending = false
      for (const d of updatedDetails) {
        if (d.awarded !== undefined) {
          newScore += d.awarded
        } else if (d.correct) {
          newScore += d.points
        }
        if (d.pending_review) stillPending = true
      }

      const setOp: Record<string, unknown> = {
        details: updatedDetails,
        score: newScore,
        has_pending_review: stillPending,
      }
      if (!stillPending) setOp.graded = true

      await db.collection('exam_submissions').updateOne(
        { exam_id: examId, user_id: userId },
        { $set: setOp }
      )

      results.push({ userId, graded: gradedInSub, failed: failList })
    }

    return NextResponse.json({
      graded: totalGraded,
      failed: totalFailed,
      candidates: results.length,
      results,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bulk AI grading failed'
    console.error('[CodeSpectra] ai-grade-all POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}