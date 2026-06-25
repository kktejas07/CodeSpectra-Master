import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { resumes } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await resumes()
    const doc = await col.findOne({ id, user_id: gate.user.id })
    if (!doc) return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] resumes GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load resume' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await resumes()
    const res = await col.deleteOne({ id, user_id: gate.user.id })
    if (res.deletedCount === 0) {
      return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    console.error('[CodeSpectra] resumes DELETE[id]:', error)
    return NextResponse.json({ error: 'Failed to delete resume' }, { status: 500 })
  }
}
