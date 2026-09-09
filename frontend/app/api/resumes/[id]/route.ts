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

export async function PATCH(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await resumes()
    const isSuperadmin = gate.user.role === 'superadmin'
    const doc = await col.findOne(
      isSuperadmin ? { id } : { id, user_id: gate.user.id },
    )
    if (!doc) return NextResponse.json({ error: 'Resume not found' }, { status: 404 })
    const body = (await request.json()) as Record<string, unknown>
    const patch: Record<string, unknown> = {}
    if ('file_name' in body) patch.file_name = String(body.file_name || '').trim() || doc.file_name
    if ('storage_url' in body) patch.storage_url = body.storage_url === null ? null : String(body.storage_url ?? '')
    if ('text_content' in body) patch.text_content = body.text_content ? String(body.text_content).slice(0, 50000) : null
    if ('is_primary' in body) patch.is_primary = Boolean(body.is_primary)
    if ('status' in body) patch.status = String(body.status || doc.status)
    if ('analysis' in body) patch.analysis = body.analysis ?? null
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
    }
    await col.updateOne({ id: doc.id }, { $set: patch })
    const updated = await col.findOne({ id: doc.id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] resumes PATCH[id]:', error)
    return NextResponse.json({ error: 'Failed to update resume' }, { status: 400 })
  }
}
