import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/api-auth'
import { tenants, users } from '@/lib/db/admin'
import { normalizeUserRole } from '@/lib/rbac'
import { invalidateAuthProfile, invalidateTenantCache, revokeAllUserSessions } from '@/lib/session'
import { auditAdmin } from '@/lib/admin-audit'

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

    // Suspending / re-activating takes effect on the next request (route-auth
    // treats a suspended tenant's admins as plain users).
    invalidateTenantCache(id)
    await auditAdmin(gate.user, 'admin.tenant.update', 'tenant', `tenant/${id}`, Object.entries($set).map(([k, v]) => `${k}=${String(v)}`).join(' '), $set.is_active === false ? 'warning' : 'info')

    const updated = await col.findOne({ id })
    return NextResponse.json({ data: updated })
  } catch (e: unknown) {
    const msg = 'Failed to update tenant'
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

    // Detach members (tenantId and the legacy organizationId) so nobody keeps
    // pointing at a deleted tenant, and demote its org admins: a tenant_admin
    // without a tenant must never exist (it used to see every tenant's data).
    const userCol = await users()
    const memberFilter = { $or: [{ tenantId: id }, { organizationId: id }] }
    const members = await userCol.find(memberFilter as never, { projection: { _id: 1, id: 1, role: 1 } }).toArray()
    const adminIds = members
      .filter((m) => normalizeUserRole(m.role as string | undefined) === 'tenant_admin')
      .map((m) => String(m.id || m._id))
    await userCol.updateMany(
      { $and: [memberFilter, { role: { $in: ['tenant_admin', 'admin'] } }] } as never,
      { $set: { role: 'user', updatedAt: new Date() } },
    )
    await userCol.updateMany(
      memberFilter as never,
      { $set: { tenantId: null, organizationId: null, updatedAt: new Date() } },
    )
    for (const uid of adminIds) await revokeAllUserSessions(uid).catch(() => {})
    for (const m of members) invalidateAuthProfile(String(m.id || m._id))
    invalidateTenantCache(id)

    // Pending org invitations to a deleted tenant can't be accepted.
    const { orgInvitations } = await import('@/lib/db/admin')
    await (await orgInvitations()).updateMany({ organization_id: id, status: 'pending' }, { $set: { status: 'revoked' } }).catch(() => {})

    await auditAdmin(gate.user, 'admin.tenant.delete', 'tenant', `tenant/${id}`, `members=${members.length} demoted_admins=${adminIds.length}`, 'critical')
    return NextResponse.json({ ok: true, members_detached: members.length, admins_demoted: adminIds.length })
  } catch (e: unknown) {
    const msg = 'Failed to delete tenant'
    console.error('[CodeSpectra] admin/tenants DELETE:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
