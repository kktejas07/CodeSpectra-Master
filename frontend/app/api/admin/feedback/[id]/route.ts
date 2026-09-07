import { NextResponse } from 'next/server'
import { updateFeedbackStatus, deleteFeedback } from '@/lib/db/feedback'
import { requireSuperAdmin } from '@/lib/route-auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSuperAdmin()
    if ('error' in gate) {
      return NextResponse.json({ error: gate.error }, { status: gate.status })
    }

    const { status } = await req.json()
    if (status !== 'open' && status !== 'resolved') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const { id } = await params
    await updateFeedbackStatus(id, status)
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
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
