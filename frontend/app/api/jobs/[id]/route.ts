import { NextResponse } from 'next/server'
import { requireAdmin, getAPIUser, gateErrorBody, isAdminCaller, isSuperAdminCaller } from '@/lib/route-auth'
import { jobs } from '@/lib/db/content'
import type { IdRouteContext } from '@/lib/app-route-context'

export async function GET(_request: Request, { params }: IdRouteContext) {
  const { id } = await params
  try {
    const user = await getAPIUser()
    const col = await jobs()
    const doc = await col.findOne({ id }, { projection: { _id: 0 } })
    if (!doc) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    // SEC-029: an admin who still owes 2FA gets the public view.
    const isStaff = isSuperAdminCaller(user)
      || (isAdminCaller(user) && !!user?.tenantId && doc.tenant_id === user.tenantId)
    // Everyone else only sees active posts, without internal fields.
    if (!isStaff) {
      if (!doc.is_active) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      const { created_by: _c, tenant_id: _t, ...pub } = doc as any
      return NextResponse.json(pub)
    }
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[CodeSpectra] jobs GET[id]:', error)
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: IdRouteContext) {
  const { id } = await params
  const gate = await requireAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user
  try {
    const data = (await request.json()) as Record<string, unknown>
    const col = await jobs()
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    // tenant_admin can only edit jobs in their own tenant
    // role-scope: a tenant admin is limited to their own tenant's posts
    if (user.role === 'tenant_admin' && (!user.tenantId || existing.tenant_id !== user.tenantId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }
    const allowed = ['title', 'company', 'location', 'job_type', 'experience_level',
      'description', 'requirements', 'benefits', 'skills', 'salary', 'is_active']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in data) updates[key] = (data as any)[key]
    }
    updates['updated_at'] = new Date().toISOString()
    await col.updateOne({ id }, { $set: updates })
    const updated = await col.findOne({ id }, { projection: { _id: 0 } })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('[CodeSpectra] jobs PATCH[id]:', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 400 })
  }
}

export async function DELETE(_request: Request, { params }: IdRouteContext) {
  const { id } = await params
  const gate = await requireAdmin() // SEC-029: enforces admin 2FA
  if ('error' in gate) return NextResponse.json(gateErrorBody(gate), { status: gate.status })
  const user = gate.user
  try {
    const col = await jobs()
    const existing = await col.findOne({ id })
    if (!existing) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    // tenant_admin can only delete jobs in their own tenant
    // role-scope: a tenant admin is limited to their own tenant's posts
    if (user.role === 'tenant_admin' && (!user.tenantId || existing.tenant_id !== user.tenantId)) {
      return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
    }
    await col.deleteOne({ id })
    return NextResponse.json({ success: true, deletedId: id })
  } catch (error) {
    console.error('[CodeSpectra] jobs DELETE[id]:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
