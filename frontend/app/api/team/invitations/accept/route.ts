import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { orgInvitations, users, tenants, nowIso } from '@/lib/db/admin'

/**
 * GET /api/team/invitations/accept?token=... — public invite lookup used by the
 * landing page to render the org name + expiry before accepting.
 */
export async function GET(request: NextRequest) {
  const token = (request.nextUrl.searchParams.get('token') || '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 })
  }

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
      invited_by: inv.invited_by,
      role: inv.role,
      expires_at: inv.expires_at,
      expired,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load invitation'
    console.error('[CodeSpectra] team/invitations/accept GET:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/team/invitations/accept — accept a pending org invitation.
 * Body: { token }. On success the caller's user doc gets tenantId set to the
 * invitation's organization, and the invitation is marked accepted.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const token = (body.token || '').trim()
  if (!token) {
    return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 })
  }

  try {
    const invCol = await orgInvitations()
    const inv = await invCol.findOne({ token })
    if (!inv || inv.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation not found or already used' }, { status: 404 })
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 410 })
    }
    if ((inv.email || '').toLowerCase() !== (gate.user.email || '').toLowerCase()) {
      return NextResponse.json({ error: 'This invitation is for another account' }, { status: 403 })
    }

    const tenantCol = await tenants()
    const tenant = await tenantCol.findOne({ id: inv.organization_id })
    if (!tenant || !tenant.is_active) {
      return NextResponse.json({ error: 'Organization is not active' }, { status: 400 })
    }

    const userCol = await users()
    const me = await userCol.findOne({ id: gate.user.id })
    if (me && !me.tenantId && !me.organizationId) {
      await userCol.updateOne(
        { id: gate.user.id },
        { $set: { tenantId: tenant.id, updatedAt: new Date() } },
      )
    }

    await invCol.updateOne(
      { id: inv.id },
      { $set: { status: 'accepted', updated_at: nowIso() } },
    )

    return NextResponse.json({ success: true, tenant_id: tenant.id, tenant_name: tenant.name })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to accept invitation'
    console.error('[CodeSpectra] team/invitations/accept POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
