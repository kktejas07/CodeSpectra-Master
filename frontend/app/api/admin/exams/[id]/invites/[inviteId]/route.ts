import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { inviteIsForExam } from '@/lib/exam-access'

/**
 * DELETE — withdraw a candidate's invite for this exam.
 *
 * Never deletes results: when the candidate has a submission, their invites
 * are revoked (the link stops working, the row and the graded work stay).
 * With no submission, every invite doc for that email + exam is removed, so
 * an older one can't resurface as the row on reload.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id, inviteId } = await params

  try {
    const db = await getMongoDb()

    const owned = await requireTenantEntity(db, 'exams', id, gate.user)
    if ('error' in owned) {
      return NextResponse.json({ error: owned.error }, { status: owned.status })
    }

    const invite = await db.collection('candidate_invites').findOne({ id: inviteId })
    if (!invite || !inviteIsForExam(invite as Record<string, unknown>, id)) {
      // Submission-only rows (share-link candidates) have no invite to withdraw.
      const sub = await db.collection('exam_submissions').findOne({ id: inviteId, exam_id: id }, { projection: { _id: 1 } })
      if (sub) {
        return NextResponse.json({ error: 'This candidate has no invite to withdraw. Their submitted results are kept.' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    const email = String(invite.email || '').toLowerCase()
    const sameCandidate = {
      $or: [
        ...(email ? [{ email }] : []),
        ...(invite.user_id ? [{ user_id: invite.user_id }] : []),
      ],
    }
    const hasSubmission = !!(await db.collection('exam_submissions').findOne({ exam_id: id, ...sameCandidate }, { projection: { _id: 1 } }))

    const related = (await db.collection('candidate_invites').find(sameCandidate).toArray())
      .filter((inv) => inviteIsForExam(inv as Record<string, unknown>, id))
      .map((inv) => inv.id)

    if (hasSubmission) {
      await db.collection('candidate_invites').updateMany(
        { id: { $in: related } },
        { $set: { status: 'revoked', updated_at: new Date().toISOString() } },
      )
      return NextResponse.json({ success: true, revoked: true, deleted: false })
    }

    await db.collection('candidate_invites').deleteMany({ id: { $in: related } })
    return NextResponse.json({ success: true, revoked: false, deleted: true })
  } catch (e: unknown) {
    console.error('[CodeSpectra] admin/exams/[id]/invites/[inviteId] DELETE:', e)
    return NextResponse.json({ error: 'Failed to withdraw invite' }, { status: 500 })
  }
}
