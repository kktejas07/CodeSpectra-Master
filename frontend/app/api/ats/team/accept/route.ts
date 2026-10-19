import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { isTenantActive } from '@/lib/session'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso } from '@/lib/db/ids'
import { limitRequest } from '@/lib/rate-limit'
import { ATS_COLLECTIONS, ATS_TENANT_COOKIE, ROLE_LABELS, atsMembers, auditAts, verifyAtsInvite } from '@/lib/ats/access'
import { decideInviteAccept } from '@/lib/ats/invite-token'

/**
 * GET /api/ats/team/accept?token= — public lookup for the invite page
 * (org, role, invited email). POST { token } — signed-in user with the invited
 * email joins the team (user_id attached, status active).
 */
export async function GET(req: NextRequest) {
  const limited = await limitRequest(req, 'ats-invite-lookup', null, 30, 60_000)
  if (limited) return limited
  const payload = await verifyAtsInvite(req.nextUrl.searchParams.get('token'))
  if (!payload) return NextResponse.json({ error: 'This invite link is invalid or has expired. Ask for a new one.' }, { status: 410 })
  try {
    const member = await (await atsMembers()).findOne({ id: payload.m })
    if (!member || member.status === 'disabled') return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })
    const db = await getMongoDb()
    const [tenant, client] = await Promise.all([
      db.collection('tenants').findOne({ id: member.tenant_id }, { projection: { name: 1, is_active: 1 } }),
      member.client_id ? db.collection(ATS_COLLECTIONS.clients).findOne({ id: member.client_id, tenant_id: member.tenant_id }, { projection: { name: 1 } }) : null,
    ])
    return NextResponse.json({
      org_name: tenant?.name || null,
      org_active: tenant?.is_active !== false && !!tenant,
      email: member.email,
      role: member.role,
      role_label: ROLE_LABELS[member.role],
      client_name: client?.name || null,
      accepted: member.status === 'active',
      superseded: member.status === 'invited' && member.invite_nonce !== payload.n,
      expires_at: new Date(payload.e).toISOString(),
    })
  } catch (e) {
    console.error('[ats/team/accept] GET failed:', e)
    return NextResponse.json({ error: 'Could not load the invitation' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'ats-invite-accept', gate.user.id, 10, 60_000)
  if (limited) return limited
  let token: unknown
  try { token = ((await req.json()) as { token?: unknown })?.token } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  try {
    const payload = await verifyAtsInvite(token)
    const col = await atsMembers()
    const member = payload ? await col.findOne({ id: payload.m }) : null
    let tenantActive = false
    if (member) { try { tenantActive = await isTenantActive(member.tenant_id) } catch { tenantActive = false } }
    const decision = decideInviteAccept({ payload, member, user: { id: gate.user.id, email: gate.user.email }, tenantActive })
    if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status })

    const ts = nowIso()
    // Claim atomically: one accept per nonce.
    const claim = await col.updateOne(
      { id: member!.id, invite_nonce: payload!.n, status: 'invited' },
      {
        $set: {
          user_id: gate.user.id,
          status: 'active',
          accepted_at: ts,
          updated_at: ts,
          invite_nonce: null,
          ...(member!.name ? {} : gate.user.name ? { name: gate.user.name } : {}),
        },
      },
    )
    if (claim.modifiedCount === 0) return NextResponse.json({ error: 'This invitation was already used' }, { status: 409 })
    await auditAts({ userId: gate.user.id, tenantId: member!.tenant_id }, 'ats.team.accept', 'ats_member', member!.id, `${member!.email} as ${member!.role}`, req)

    const res = NextResponse.json({
      ok: true,
      tenant_id: member!.tenant_id,
      role: member!.role,
      redirect: member!.role === 'client' ? '/dashboard/hiring/client' : member!.role === 'interviewer' ? '/dashboard/hiring/interviews' : '/dashboard/hiring',
    })
    // Switch to the team just joined.
    res.cookies.set(ATS_TENANT_COOKIE, member!.tenant_id, { path: '/', sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 180 * 86_400 })
    return res
  } catch (e) {
    console.error('[ats/team/accept] POST failed:', e)
    return NextResponse.json({ error: 'Could not accept the invitation' }, { status: 500 })
  }
}
