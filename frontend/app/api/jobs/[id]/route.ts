import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { jobs } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const col = await jobs()
    const doc = await col.findOne({ id })
    if (!doc) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] jobs GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const data = (await request.json()) as Record<string, unknown>
    const col = await jobs()
    await col.updateOne({ id }, { $set: data })
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] jobs PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await jobs()
    await col.deleteOne({ id })
    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    console.error('[CodeSpectra] jobs DELETE[id]:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
