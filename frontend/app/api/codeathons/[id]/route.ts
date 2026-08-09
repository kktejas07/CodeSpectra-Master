import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { codeathons, nowIso } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const col = await codeathons()
    const doc = await col.findOne({ id })
    if (!doc) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
    return NextResponse.json(doc)
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
    const data = (await request.json()) as Record<string, unknown>
    const col = await codeathons()
    // tenant_admin can only edit codeathons in their own tenant
    if (gate.user.role === 'tenant_admin' && gate.user.tenantId) {
      const existing = await col.findOne({ id })
      if (!existing) return NextResponse.json({ error: 'Codeathon not found' }, { status: 404 })
      if (existing.tenant_id !== gate.user.tenantId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    await col.updateOne({ id }, { $set: { ...data, updated_at: nowIso() } })
    const updated = await col.findOne({ id })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] codeathons PUT[id]:', error)
    return NextResponse.json({ error: 'Failed to update codeathon' }, { status: 400 })
  }
}
