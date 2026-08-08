import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'

import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

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

    const result = await db.collection('exam_submissions').updateOne(
      { exam_id: examId, user_id: userId },
      { $set: { released_at: nowIso(), score_released: true } },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Determine candidate name
    let candidateName = submission.email ? submission.email.split('@')[0] : 'Candidate'
    const userDoc = await db.collection('user').findOne({ $or: [{ _id: userId as any }, { id: userId }] })
    if (userDoc) {
      candidateName = userDoc.fullName || userDoc.name || candidateName
    } else {
      const invite = await db.collection('candidate_invites').findOne({ user_id: userId })
      if (invite?.full_name) candidateName = invite.full_name
    }

    // Send email notification
    if (submission.email) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const resultsUrl = `${appUrl}/dashboard/assessments`
      const template = emailTemplates.assessmentScoreReleased({
        candidateName,
        examTitle,
        score: Math.round(submission.score || 0),
        maxScore: Math.round(submission.max_score || 100),
        resultsUrl,
      })
      await sendEmail(submission.email, template).catch(err => {
        console.error('[CodeSpectra] Failed to send release email:', err)
      })
    }

    return NextResponse.json({ success: true, released_at: nowIso() })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to release score'
    console.error('[CodeSpectra] release score PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
