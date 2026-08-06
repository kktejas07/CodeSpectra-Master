import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { tenants, users } from '@/lib/db/admin'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params

  let body: { name?: string; slug?: string; plan?: string; is_active?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const col = await tenants()
    const $set: Record<string, unknown> = {}
    if (body.name !== undefined) $set.name = String(body.name).trim()
    if (body.slug !== undefined) $set.slug = String(body.slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (body.plan !== undefined) $set.plan = body.plan
    if (body.is_active !== undefined) $set.is_active = Boolean(body.is_active)

    if (Object.keys($set).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const result = await col.updateOne({ id }, { $set })
    if (result.matchedCount === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const updated = await col.findOne({ id })
    return NextResponse.json({ data: updated })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update tenant'
    console.error('[CodeSpectra] admin/tenants PATCH:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { id } = await params

  try {
    const col = await tenants()
    const result = await col.deleteOne({ id })
    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Detach members so they don't keep pointing at a deleted tenant
    const userCol = await users()
    await userCol.updateMany(
      { tenantId: id },
      { $set: { tenantId: null, updatedAt: new Date() } },
    )

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete tenant'
    console.error('[CodeSpectra] admin/tenants DELETE:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
