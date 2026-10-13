import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { gradeAnswer, GradeRateLimitedError } from '@/lib/ai/grade-question'
import { isDeterministicType } from '@/lib/question-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Reject if a promise exceeds ms (so one slow provider can't hang the request). */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

/** Pace = one LLM call per >1s so we stay under the provider RPM cap. */
const LLM_PACE_MS = 1100
/** Hard cap on one grade (chain walk + Jev). A hung provider used to run 180s. */
const GRADE_TIMEOUT_MS = 30000
/**
 * Hard wall-clock budget per request. The proxy kills long requests (~100s) and
 * returns an HTML 524 page → the client's JSON parse blows up. Stopping on TIME
 * (not just grade count) guarantees we answer before that, whatever the
 * providers do. The client loops until hasMore is false.
 */
const REQUEST_BUDGET_MS = 55000

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
    let hasMore = false
    const requestStart = Date.now()

    type DetailDoc = {
      qId: string; correct: boolean; points: number; answer: string; pending_review?: boolean; awarded?: number; remarks?: string; requires_human_review?: boolean; confidence?: number; jev_agree?: boolean | null; jev_confidence?: number | null; graded_by?: string | null
    }

    // Persist one submission's current detail set + recomputed score. Called
    // incrementally so a request that stops early (budget) or times out still
    // leaves completed grades in the DB — exiting never loses work.
    const persist = async (userId: string, updatedDetails: DetailDoc[]) => {
      let newScore = 0
      let stillPending = false
      for (const d of updatedDetails) {
        if (d.awarded !== undefined) newScore += d.awarded
        else if (d.correct) newScore += d.points
        if (d.pending_review) stillPending = true
      }
      const setOp: Record<string, unknown> = { details: updatedDetails, score: newScore, has_pending_review: stillPending }
      if (!stillPending) setOp.graded = true
      await db.collection('exam_submissions').updateOne({ exam_id: examId, user_id: userId }, { $set: setOp })
    }

    outer:
    for (const submission of submissions) {
      const userId = submission.user_id
      try {
      const details = (submission.details || []) as DetailDoc[]
      const answers = (submission.answers || {}) as Record<string, string>
      const failList: string[] = []

      const updatedDetails: DetailDoc[] = []
      let gradedInSub = 0

      for (let i = 0; i < details.length; i++) {
        const d = details[i]
        const isPending = d.pending_review === true
        const needsGrade = isPending || (d.awarded === undefined && !d.correct && (body.includeAnswered ? !!answers[d.qId] : false))
        const q = questions.find((x: any) => x.id === d.qId)
        const answer = String(answers[d.qId] || '').trim()

        if (needsGrade && q && answer) {
          const isObjective = isDeterministicType(q.type)
          // Free-text grades are the slow ones — stop once the request budget
          // is spent and let the client resume on the next call.
          if (!isObjective && Date.now() - requestStart > REQUEST_BUDGET_MS) {
            updatedDetails.push(...details.slice(i))
            hasMore = true
            await persist(userId, updatedDetails)
            results.push({ userId, graded: gradedInSub, failed: failList })
            break outer
          }

          let res: Awaited<ReturnType<typeof gradeAnswer>> | null = null
          try {
            res = await withTimeout(
              gradeAnswer({
                questionText: q.prompt || q.question || q.title || 'Question',
                candidateAnswer: answer,
                modelAnswer: String(q.answer || q.correct_answer || '').trim(),
                type: q.type || '',
                maxPoints: q.points || q.score || d.points || 10,
                options: Array.isArray(q.options) ? q.options.map(String) : undefined,
                testCases: q.test_cases || q.testCases,
                tolerance: typeof q.tolerance === 'number' ? q.tolerance : undefined,
                pairs: Array.isArray(q.pairs) ? q.pairs : undefined,
                matrix: q.matrix || undefined,
                table: q.table || undefined,
              }),
              GRADE_TIMEOUT_MS,
              'grade timeout',
            )
          } catch (e: unknown) {
            if (e instanceof GradeRateLimitedError) {
              // Cap the in-request wait small; a long provider cooldown would
              // blow the request budget on a sleep. Remaining work resumes on
              // the client's next call.
              const backoff = Math.max(1, Math.min(8, (e as any).retryAfterSec || 8))
              await sleep(backoff * 1000 + 500)
              try {
                res = await withTimeout(
                  gradeAnswer({
                    questionText: q.prompt || q.question || q.title || 'Question',
                    candidateAnswer: answer,
                    modelAnswer: String(q.answer || q.correct_answer || '').trim(),
                    type: q.type || '',
                    maxPoints: q.points || q.score || d.points || 10,
                    options: Array.isArray(q.options) ? q.options.map(String) : undefined,
                    testCases: q.test_cases || q.testCases,
                  }),
                  GRADE_TIMEOUT_MS,
                  'grade timeout',
                )
              } catch {
                failList.push(d.qId); totalFailed++; updatedDetails.push(d); continue
              }
            } else {
              failList.push(d.qId); totalFailed++; updatedDetails.push(d); continue
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
          if (!isObjective) {
            await sleep(LLM_PACE_MS)
          }
        } else {
          updatedDetails.push(d)
        }
      }

      await persist(userId, updatedDetails)
      results.push({ userId, graded: gradedInSub, failed: failList })
      } catch (e) {
        // One candidate's failure must not 500 the whole chunk (which would
        // mark every candidate in it as failed on the client).
        console.error('[CodeSpectra] ai-grade-all submission failed:', userId, e)
        results.push({ userId, graded: 0, failed: ['processing error — retry'] })
      }
    }

    // Tell the client whether more free-text grades remain (it loops until false).
    if (!hasMore) {
      const pendingLeft = await db.collection('exam_submissions').countDocuments({
        ...(userIds ? { user_id: { $in: userIds } } : {}),
        exam_id: examId,
        has_pending_review: true,
      })
      hasMore = pendingLeft > 0
    }

    return NextResponse.json({
      graded: totalGraded,
      failed: totalFailed,
      candidates: results.length,
      results,
      hasMore,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bulk AI grading failed'
    console.error('[CodeSpectra] ai-grade-all POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}