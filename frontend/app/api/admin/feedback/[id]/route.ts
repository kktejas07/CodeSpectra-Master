import { NextResponse } from 'next/server'
import { updateFeedbackStatus, deleteFeedback } from '@/lib/db/feedback'
import { getAPIUser } from '@/lib/route-auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAPIUser()
    if (!user || user.role === 'user') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const user = await getAPIUser()
    if (!user || user.role === 'user') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    await deleteFeedback(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to delete feedback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
