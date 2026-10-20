import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { ObjectId } from 'mongodb'
import { deleteFeedback } from '@/lib/db/feedback'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const { id } = await params
    const body = await req.json()
    const $set: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.status !== undefined && (body.status === 'open' || body.status === 'resolved')) {
      $set.status = body.status
    }
    if (body.admin_reply && typeof body.admin_reply === 'string' && body.admin_reply.trim()) {
      $set.admin_reply = body.admin_reply.trim()
      $set.replied_at = new Date().toISOString()
      $set.replied_by = gate.user.id
    }

    const db = await getMongoDb()
    await db.collection('platform_feedback').updateOne(
      { _id: new ObjectId(id) },
      { $set }
    )

    await auditAdmin(gate.user, 'admin.feedback.update', 'feedback', `feedback/${id}`, Object.keys($set).join(', '))
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to update feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const { id } = await params
    await deleteFeedback(id)
    await auditAdmin(gate.user, 'admin.feedback.delete', 'feedback', `feedback/${id}`, undefined, 'warning')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
