/**
 * POST /api/admin/integrations/ats-push   body: { examId, userId }
 *
 * Push one candidate's stored submission to the configured ATS providers
 * (Greenhouse / Lever / Workday). Manual only — the "Push to ATS" button on
 * the assessment results page; nothing pushes automatically on grading.
 *
 * SEC: the ATS credentials are platform-wide (Admin → Integrations), so this
 * is superadmin-only, and the candidate's name, email and score are read from
 * the database — never taken from the request body.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { apiErrorFor } from '@/lib/api-errors'
import { getMongoDb } from '@/lib/mongodb'
import { getUserById } from '@/lib/db/admin'
import { getAppOrigin } from '@/lib/app-origin'
import { limitRequest } from '@/lib/rate-limit'
import { auditAdmin } from '@/lib/admin-audit'
import { pushCandidateToAts } from '@/lib/integrations/ats-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const limited = await limitRequest(req, 'ats-push', gate.user.id, 60, 60 * 60_000)
  if (limited) return limited

  const body = await req.json().catch(() => null) as { examId?: unknown; userId?: unknown } | null
  const examId = typeof body?.examId === 'string' ? body.examId : ''
  const userId = typeof body?.userId === 'string' ? body.userId : ''
  if (!ID_RE.test(examId) || !ID_RE.test(userId)) {
    return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const exam = await db.collection('exams').findOne({ id: examId }, { projection: { _id: 0, title: 1 } })
    if (!exam) return NextResponse.json(apiErrorFor('assessment_not_found'), { status: 404 })
    const submission = await db.collection('exam_submissions').findOne(
      { exam_id: examId, user_id: userId },
      { sort: { created_at: -1 }, projection: { _id: 0, id: 1, email: 1, score: 1, max_score: 1, submitted_at: 1 } },
    )
    if (!submission) return NextResponse.json(apiErrorFor('ats_no_submission'), { status: 404 })

    const user = await getUserById(userId)
    const email = String(user?.email || submission.email || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(apiErrorFor('ats_no_email'), { status: 422 })
    }
    const max = Number(submission.max_score)
    const score = max > 0 ? Math.max(0, Math.min(100, Math.round((Number(submission.score) / max) * 100))) : 0

    const results = await pushCandidateToAts({
      userId,
      name: String(user?.fullName || user?.name || email.split('@')[0]).slice(0, 120),
      email,
      assessmentTitle: String(exam.title || examId).slice(0, 200),
      score,
      submittedAt: String(submission.submitted_at || ''),
      resultsUrl: `${getAppOrigin()}/dashboard/admin/assessments/${encodeURIComponent(examId)}/results`,
    })

    void auditAdmin(
      gate.user, 'integrations.ats_push', 'exam_submission', `exam/${examId}/user/${userId}`,
      results.map((r) => `${r.provider}:${r.ok ? 'ok' : 'failed'}`).join(', ') || 'no providers configured',
    ).catch(() => {})

    if (results.length === 0) return NextResponse.json({ message: 'No ATS providers configured.', results: [] })
    return NextResponse.json({ results }, { status: results.some((r) => !r.ok) ? 207 : 200 })
  } catch (e) {
    console.error('[ats-push] failed', e)
    return NextResponse.json(apiErrorFor('ats_push_failed'), { status: 500 })
  }
}
