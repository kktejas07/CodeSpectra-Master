import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { recomputeCodeathonStanding } from '@/lib/codeathon-run'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; submissionId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { id: codeathonId, submissionId } = await params
  const body = await request.json() as {
    score?: number
    review_notes?: string
    status?: string
  }

  try {
    const db = await getMongoDb()

    // tenant_admin may only grade submissions of their own tenant's codeathon.
    const owned = await requireTenantEntity(db, 'codeathons', codeathonId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })

    const submission = await db.collection('codeathon_submissions').findOne({
      id: submissionId,
      codeathon_id: codeathonId,
    })

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    const previousScore = Number(submission.score) || 0
    const newScore = body.score !== undefined ? Math.max(0, Math.round(Number(body.score) || 0)) : previousScore
    const scoreDiff = newScore - previousScore
    const allowedStatus = ['accepted', 'wrong_answer', 'rejected', 'under_review']
    if (body.status && !allowedStatus.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const updateDoc: Record<string, any> = {
      reviewed_by: gate.user.id,
      reviewer_name: gate.user.fullName || gate.user.email || 'Judge',
      reviewed_at: new Date().toISOString(),
      review_notes: typeof body.review_notes === 'string' ? body.review_notes.slice(0, 5000) : '',
      is_reviewed: true,
    }

    if (body.score !== undefined) {
      updateDoc.score = newScore
    }
    if (body.status) {
      updateDoc.status = body.status
    }

    await db.collection('codeathon_submissions').updateOne(
      { id: submissionId },
      { $set: updateDoc }
    )

    // Rebuild the standing from best-per-problem scores.
    if ((scoreDiff !== 0 || body.status) && submission.user_id) {
      await recomputeCodeathonStanding(db, codeathonId, { userId: submission.user_id, teamId: submission.team_id || null })
    }

    return NextResponse.json({
      ok: true,
      submission: {
        ...submission,
        ...updateDoc,
      },
    })
  } catch (error) {
    console.error('[CodeSpectra] POST codeathon submission review error:', error)
    return NextResponse.json({ error: 'Failed to save review' }, { status: 500 })
  }
}
