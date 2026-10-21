import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { orgInvitations, users, tenants, nowIso } from '@/lib/db/admin'
import { decideAccept } from '@/lib/org-invitations-core'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'
import { userIdFilter } from '@/lib/entitlements'

/**
 * GET /api/team/invitations/accept?token=... — public invite lookup used by the
 * landing page to render the org name + expiry before accepting.
 */
export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('token') || '').trim()
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
  }
  // Public lookup: rate limit token guessing.
  const rl = await rateLimitRedis(`invite-lookup:${clientLimiterKeyFromRequest(request, null)}`, 30, 60_000).catch(() => ({ ok: true as const }))
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests', code: 'too_many_requests' }, { status: 429 })

  try {
    const invCol = await orgInvitations()
    const inv = await invCol.findOne({ token })
    if (!inv || inv.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
    }
    const expired = new Date(inv.expires_at).getTime() < Date.now()

    const tenantCol = await tenants()
    const tenant = await tenantCol.findOne({ id: inv.organization_id })

    return NextResponse.json({
      org_name: tenant?.name || null,
      org_active: tenant?.is_active ?? false,
      email: inv.email,
      role: inv.role,
      expires_at: inv.expires_at,
      expired,
    })
  } catch (e: unknown) {
    const msg = 'Failed to load invitation'
    console.error('[CodeSpectra] team/invitations/accept GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/team/invitations/accept — accept a pending org invitation.
 * Body: { token }. On success the caller joins the invitation's organisation
 * with the invited role, and the invitation is marked accepted. A user who
 * already belongs to another organisation gets 409 (never a fake success).
 */
export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 })
  }

  try {
    const invCol = await orgInvitations()
    const inv = await invCol.findOne({ token })
    const tenant = inv ? await (await tenants()).findOne({ id: inv.organization_id }) : null
    const userCol = await users()
    const me = await userCol.findOne(userIdFilter(gate.user.id))
    const myTenant = ((me?.tenantId as string | null) ?? (me?.organizationId as string | null) ?? null)

    const decision = decideAccept({
      invite: inv,
      userEmail: gate.user.email,
      userRole: gate.user.role,
      userTenantId: myTenant,
      tenantActive: !!tenant && tenant.is_active !== false,
    })
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status })
    if (!me) return NextResponse.json({ error: 'Account not found', code: 'auth_account_not_found' }, { status: 404 })

    // Claim the invitation atomically (one accept per token).
    const claim = await invCol.updateOne(
      { id: inv!.id, status: 'pending' },
      { $set: { status: 'accepted', accepted_by: gate.user.id, updated_at: nowIso() } } as never,
    )
    if (claim.modifiedCount === 0) {
      return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
    }

    // Join the organisation with the invited role (D31). A superadmin keeps theirs.
    await userCol.updateOne(userIdFilter(gate.user.id), {
      $set: { tenantId: tenant!.id, role: decision.role, updatedAt: new Date() },
    })

    return NextResponse.json({ success: true, tenant_id: tenant!.id, tenant_name: tenant!.name, role: decision.role })
  } catch (e: unknown) {
    const msg = 'Failed to accept invitation'
    console.error('[CodeSpectra] team/invitations/accept POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
