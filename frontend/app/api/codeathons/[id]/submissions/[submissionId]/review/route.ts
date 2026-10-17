import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

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
    const newScore = body.score !== undefined ? Number(body.score) : previousScore
    const scoreDiff = newScore - previousScore

    const updateDoc: Record<string, any> = {
      reviewed_by: gate.user.id,
      reviewer_name: gate.user.fullName || gate.user.email || 'Judge',
      reviewed_at: new Date().toISOString(),
      review_notes: body.review_notes || '',
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

    // Adjust leaderboard total score if score changed
    if (scoreDiff !== 0 && submission.user_id) {
      await db.collection('codeathon_leaderboard').updateOne(
        { codeathon_id: codeathonId, user_id: submission.user_id },
        { $inc: { total_score: scoreDiff } }
      )

      if (submission.team_id) {
        await db.collection('codeathon_leaderboard').updateOne(
          { codeathon_id: codeathonId, team_id: submission.team_id },
          { $inc: { total_score: scoreDiff } }
        )
      }
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
