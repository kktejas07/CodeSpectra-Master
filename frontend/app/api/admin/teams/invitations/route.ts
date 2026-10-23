import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isSuperAdminCaller, type APIUser } from '@/lib/route-auth'
import { orgInvitations, tenants, users, nowIso } from '@/lib/db/admin'
import { createOrgInvitation, checkSeatLimit } from '@/lib/org-invitations'
import { resolveInviteRole } from '@/lib/org-invitations-core'
import { auditAdmin } from '@/lib/admin-audit'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'

export const dynamic = 'force-dynamic'

function parseEmail(s: unknown): string | null {
  const e = typeof s === 'string' ? s.trim().toLowerCase() : ''
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

/** Caller's organisation; a superadmin may target one with `tenantId`. */
function tenantFor(user: APIUser, requested: unknown): string | null {
  if (isSuperAdminCaller(user) && typeof requested === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(requested)) return requested
  return user.tenantId || null
}

/** GET — pending invitations for the caller's organisation (no tokens). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const tenantId = tenantFor(gate.user, req.nextUrl.searchParams.get('tenantId'))
  if (!tenantId) return NextResponse.json({ data: [] })
  try {
    const rows = await (await orgInvitations())
      .find({ organization_id: tenantId, status: 'pending', expires_at: { $gt: nowIso() } }, { projection: { _id: 0, token: 0 } })
      .sort({ created_at: -1 })
      .limit(200)
      .toArray()
    return NextResponse.json({ data: rows })
  } catch (e) {
    console.error('[admin/teams/invitations] GET', e)
    return NextResponse.json({ error: 'Failed to load invitations' }, { status: 500 })
  }
}

/** POST { email, role? } — invite someone to the caller's organisation and email them. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rl = await rateLimitRedis(`org-invite:${gate.user.id}`, 30, 60 * 60_000).catch(() => ({ ok: true as const }))
  if (!rl.ok) return NextResponse.json({ error: 'Too many invitations. Try again later.' }, { status: 429 })

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; role?: unknown; tenantId?: unknown }
  const email = parseEmail(body.email)
  if (!email) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  const tenantId = tenantFor(gate.user, body.tenantId)
  if (!tenantId) return NextResponse.json({ error: 'You must belong to an organization to invite members.' }, { status: 403 })

  try {
    const tenant = await (await tenants()).findOne({ id: tenantId }, { projection: { is_active: 1 } })
    if (!tenant || tenant.is_active === false) return NextResponse.json({ error: 'Organization is not active' }, { status: 400 })

    const existing = await (await users()).findOne({ email }, { projection: { tenantId: 1, organizationId: 1 } })
    const existingTenant = (existing?.tenantId as string | null) ?? (existing?.organizationId as string | null) ?? null
    if (existingTenant === tenantId) return NextResponse.json({ error: 'This person is already a member.' }, { status: 409 })
    if (existingTenant) return NextResponse.json({ error: 'This person belongs to another organization.' }, { status: 409 })

    const seatDenied = await checkSeatLimit(gate.user, tenantId)
    if (seatDenied) return NextResponse.json(seatDenied, { status: 402 })

    const role = resolveInviteRole(gate.user.role, body.role)
    const { invitation, emailed } = await createOrgInvitation({
      tenantId,
      email,
      role,
      invitedBy: { id: gate.user.id, name: gate.user.fullName || gate.user.name, email: gate.user.email },
    })
    await auditAdmin(gate.user, 'admin.org.invite', 'organization', `tenant/${tenantId}`, `${email} as ${role}`)
    return NextResponse.json({ invitation, emailed }, { status: 201 })
  } catch (e) {
    console.error('[admin/teams/invitations] POST', e)
    return NextResponse.json({ error: 'Failed to send the invitation' }, { status: 500 })
  }
}

/** DELETE ?id= — revoke a pending invitation in the caller's organisation. */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const filter: Record<string, unknown> = { id, status: 'pending' }
    if (gate.user.role !== 'superadmin') {
      if (!gate.user.tenantId) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
      filter.organization_id = gate.user.tenantId
    }
    const res = await (await orgInvitations()).updateOne(filter as never, { $set: { status: 'revoked', updated_at: nowIso() } } as never)
    if (res.modifiedCount === 0) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    await auditAdmin(gate.user, 'admin.org.invite_revoke', 'organization', `invitation/${id}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/teams/invitations] DELETE', e)
    return NextResponse.json({ error: 'Failed to revoke the invitation' }, { status: 500 })
  }
}
