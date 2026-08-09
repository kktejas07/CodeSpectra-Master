import { NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'

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

    // Find the invite first to get user_id/email for deleting matching submissions
    const invite = await db.collection('candidate_invites').findOne({ id: inviteId })
    
    const result = await db.collection('candidate_invites').deleteOne({ id: inviteId })
    if (result.deletedCount === 0) {
      // If invite wasn't found, maybe it's a submission-only row. Let's try to delete submission directly by id
      const subResult = await db.collection('exam_submissions').deleteOne({ id: inviteId, exam_id: id })
      if (subResult.deletedCount === 0) {
        return NextResponse.json({ error: 'Invite or submission not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true })
    }

    // Delete associated exam submission if user_id exists
    if (invite && invite.user_id) {
      await db.collection('exam_submissions').deleteOne({
        exam_id: id,
        user_id: invite.user_id
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete invite'
    console.error('[CodeSpectra] admin/exams/[id]/invites/[inviteId] DELETE:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
