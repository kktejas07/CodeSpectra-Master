import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeathons, nowIso } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'
import { isTenantStaff, pickFields, publicCodeathonView, CODEATHON_EDITABLE_FIELDS } from '@/lib/exam-access'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await params
  try {
    const col = await codeathons()
    const doc = await col.findOne({ id })
    if (!doc) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    // Participants never get hidden test cases (they are the grading key).
    if (isTenantStaff(gate.user, doc as unknown as Record<string, unknown>)) return NextResponse.json(doc)
    return NextResponse.json(publicCodeathonView(doc as unknown as Record<string, unknown>))
  } catch (error) {
    console.error('[CodeSpectra] codeathons GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load codeathon' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    // Allow-list: never id/_id/tenant_id/created_by/participants from the body.
    const data = pickFields(await request.json().catch(() => ({})), CODEATHON_EDITABLE_FIELDS)
    const col = await codeathons()
    // tenant_admin can only edit codeathons in their own tenant
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    if (!isTenantStaff(gate.user, existing as unknown as Record<string, unknown>)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await col.updateOne({ id }, { $set: { ...data, updated_at: nowIso() } })
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] codeathons PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update codeathon' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: IdRouteContext) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { id } = await params
  try {
    const col = await codeathons()
    if (gate.user.role === 'tenant_admin' && gate.user.tenantId) {
      const existing = await col.findOne({ id })
      if (!existing) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
      if (existing.tenant_id !== gate.user.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    const res = await col.deleteOne({ id })
    if (res.deletedCount === 0) {
      return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    console.error('[CodeSpectra] codeathons DELETE[id]:', error)
    return NextResponse.json({ error: 'Failed to delete codeathon' }, { status: 400 })
  }
}
