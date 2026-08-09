import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ai'

import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id: examId } = await params

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }
    const examTitle = owned.doc?.title || 'Technical Assessment'

    // Find all unreleased submissions first to send emails
    const unreleasedSubmissions = await db.collection('exam_submissions').find({
      exam_id: examId,
      released_at: { $exists: false }
    }).toArray()

    // Only release submissions that have finished grading (no pending review)
    const releasedNow = unreleasedSubmissions.filter(s => s.has_pending_review !== true)
    const skippedPending = unreleasedSubmissions.length - releasedNow.length

    const result = await db.collection('exam_submissions').updateMany(
      { exam_id: examId, released_at: { $exists: false }, has_pending_review: { $ne: true } },
      { $set: { released_at: nowIso(), score_released: true } },
    )

    // Notify candidates asynchronously (fire-and-forget/logged error handling)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const resultsUrl = `${appUrl}/dashboard/exams`
    
    for (const sub of releasedNow) {
      if (sub.email) {
        let candidateName = sub.email.split('@')[0]
        const userDoc = await db.collection('user').findOne({ $or: [{ _id: sub.user_id as any }, { id: sub.user_id }] })
        if (userDoc) {
          candidateName = userDoc.fullName || userDoc.name || candidateName
        } else {
          const invite = await db.collection('candidate_invites').findOne({ user_id: sub.user_id })
          if (invite?.full_name) candidateName = invite.full_name
        }

        const template = emailTemplates.assessmentScoreReleased({
          candidateName,
          examTitle,
          score: Math.round(sub.score || 0),
          maxScore: Math.round(sub.max_score || 100),
          resultsUrl,
        })
        sendEmail(sub.email, template).catch(err => {
          console.error(`[CodeSpectra] Failed to send bulk release email to ${sub.email}:`, err)
        })
      }
    }

    return NextResponse.json({
      success: true,
      released: result.modifiedCount,
      skipped_pending: skippedPending,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to bulk release'
    console.error('[CodeSpectra] bulk release POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
