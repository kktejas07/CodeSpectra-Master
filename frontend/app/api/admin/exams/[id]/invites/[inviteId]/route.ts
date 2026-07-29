import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { inviteId } = await params

  try {
    const db = await getMongoDb()
    const result = await db.collection('candidate_invites').deleteOne({ id: inviteId })
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete invite'
    console.error('[CodeSpectra] admin/exams/[id]/invites/[inviteId] DELETE:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
