import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'
import { notifyResultsReleased } from '@/lib/exam-release-notify'
import { deliverExamCertificate, issueExamCertificate } from '@/lib/db/certifications'
import { examPassPercent } from '@/lib/exam-access'

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId, userId } = await params

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }

    // Find the submission and the exam first
    const submission = await db.collection('exam_submissions').findOne({ exam_id: examId, user_id: userId })
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Never release before manual grading completes (coding/descriptive pending)
    if (submission.has_pending_review === true) {
      return NextResponse.json({
        error: 'Grading is still pending — this candidate has coding/descriptive answers that must be reviewed before the score can be released.',
        blocked: true,
      }, { status: 400 })
    }

    const exam = await db.collection('exams').findOne({ id: examId })
    const examTitle = exam?.title || 'Technical Assessment'
    // Pass/fail uses the exam's remembered cutoff (bulk release stores it).
    const cutoff = examPassPercent((exam || {}) as Record<string, unknown>)
    const maxScore = Number(submission.max_score)
    const pct =
      Number.isFinite(Number(submission.score)) && Number.isFinite(maxScore) && maxScore > 0
        ? Math.max(0, Math.min(100, Math.round((Number(submission.score) / maxScore) * 100)))
        : null
    const isPass = pct !== null && pct >= cutoff

    const result = await db.collection('exam_submissions').updateOne(
      { exam_id: examId, user_id: userId },
      { $set: { released_at: nowIso(), score_released: true, passed: isPass, cutoff } },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Verifiable certificate when the released score meets the pass mark (idempotent per exam + user).
    let certificateUrl: string | null = null
    if (exam) {
      try {
        const cert = await issueExamCertificate(db, exam as Record<string, unknown>, { ...submission, score_released: true, released_at: nowIso() }, cutoff)
        if (cert) {
          certificateUrl = `/cert/verify/${cert.token}`
          // Once, on first issue: in-app for account holders, email for invite-only candidates.
          await deliverExamCertificate(exam as Record<string, unknown>, userId, cert)
        }
      } catch (e) {
        console.error('[CodeSpectra] release certificate issue failed:', e)
      }
    }

    // Same channels as the bulk release (in-app + WhatsApp + email).
    await notifyResultsReleased(db, { ...(exam || {}), id: examId, title: examTitle } as Record<string, unknown>, submission as Record<string, unknown>)

    return NextResponse.json({ success: true, released_at: nowIso(), certificate_url: certificateUrl })
  } catch (e: unknown) {
    const msg = 'Failed to release score'
    console.error('[CodeSpectra] release score PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
