import { NextRequest, NextResponse } from 'next/server'
import {
  atsMembers,
  atsCollection,
  auditAts,
  can,
  getAccessSettings,
  newMemberDoc,
  parseInviteInput,
  publicMember,
  requireAts,
  sendAtsInvite,
  tenantFromRequest,
} from '@/lib/ats/access'
import { limitRequest } from '@/lib/rate-limit'
import { sanitizeMongoInput } from '@/lib/mongo-sanitize'

/**
 * GET /api/ats/team?tenant= — members of the tenant's hiring team (admin, recruiter,
 * hiring manager) + access settings. POST — invite { email, role, name?, client_id? } (admin).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAts(['admin', 'recruiter', 'hiring_manager'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  try {
    const [members, settings, clients] = await Promise.all([
      (await atsMembers()).find({ tenant_id: actor.tenantId }).sort({ created_at: -1 }).limit(500).toArray(),
      getAccessSettings(actor.tenantId),
      (await atsCollection('clients')).find({ tenant_id: actor.tenantId }, { projection: { _id: 0, id: 1, name: 1 } }).limit(500).toArray(),
    ])
    return NextResponse.json({
      members: members.map(publicMember),
      settings,
      clients,
      me: { user_id: actor.userId, role: actor.role, tenant_id: actor.tenantId, can_manage: can(actor, 'team.manage') },
    })
  } catch (e) {
    console.error('[ats/team] GET failed:', e)
    return NextResponse.json({ error: 'Could not load the team' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  const limited = await limitRequest(req, 'ats-team-invite', actor.userId, 30, 60 * 60_000)
  if (limited) return limited

  let body: unknown
  try { body = sanitizeMongoInput(await req.json()) } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }
  const parsed = parseInviteInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const input = parsed.value

  try {
    if (input.client_id) {
      const client = await (await atsCollection('clients')).findOne({ id: input.client_id, tenant_id: actor.tenantId }, { projection: { id: 1 } })
      if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 })
    }
    const col = await atsMembers()
    const existing = await col.findOne({ tenant_id: actor.tenantId, email: input.email })
    if (existing) {
      return NextResponse.json(
        { error: existing.status === 'disabled' ? 'This person is on the team but disabled. Re-enable them instead.' : 'This person is already on the team. Resend their invite instead.', member: publicMember(existing) },
        { status: 409 },
      )
    }
    const doc = newMemberDoc({ tenantId: actor.tenantId, email: input.email, name: input.name, role: input.role, clientId: input.client_id, invitedBy: actor.userId })
    try {
      await col.insertOne(doc)
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) return NextResponse.json({ error: 'This person is already on the team' }, { status: 409 })
      throw e
    }
    const { emailed } = await sendAtsInvite(doc, { name: actor.name, email: actor.email })
    await auditAts(actor, 'ats.team.invite', 'ats_member', doc.id, `${input.email} as ${input.role}${input.client_id ? ` (client ${input.client_id})` : ''}`, req)
    const fresh = await col.findOne({ id: doc.id })
    return NextResponse.json({ member: publicMember(fresh || doc), emailed }, { status: 201 })
  } catch (e) {
    console.error('[ats/team] POST failed:', e)
    return NextResponse.json({ error: 'Could not send the invite' }, { status: 500 })
  }
}
