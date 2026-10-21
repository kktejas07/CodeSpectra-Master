import { NextRequest, NextResponse } from 'next/server'
import {
  atsMembers,
  atsCollection,
  auditAts,
  parseId,
  parseRole,
  publicMember,
  requireAts,
  sendAtsInvite,
  tenantFromRequest,
  type AtsMemberDoc,
} from '@/lib/ats/access'
import { limitRequest } from '@/lib/rate-limit'
import { nowIso } from '@/lib/db/ids'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PATCH /api/ats/team/[id] (admin)
 *   { action: 'resend' }                       → new invite link (old one stops working)
 *   { role, client_id? }                       → change role
 *   { status: 'active' | 'disabled' }          → enable / disable
 * DELETE /api/ats/team/[id] (admin) → remove from the team.
 * Admins can't change or remove their own membership.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  const gate = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate

  let body: Record<string, unknown>
  try {
    const raw = await req.json()
    body = raw && typeof raw === 'object' ? raw : {}
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  try {
    const col = await atsMembers()
    const member = await col.findOne({ id, tenant_id: actor.tenantId })
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    const self = !!member.user_id && member.user_id === actor.userId

    if (body.action === 'resend') {
      const limited = await limitRequest(req, 'ats-team-invite', actor.userId, 30, 60 * 60_000)
      if (limited) return limited
      if (member.status !== 'invited') return NextResponse.json({ error: 'Only pending invites can be resent' }, { status: 400 })
      const { emailed } = await sendAtsInvite(member, { name: actor.name, email: actor.email })
      await auditAts(actor, 'ats.team.resend', 'ats_member', id, member.email, req)
      return NextResponse.json({ member: publicMember((await col.findOne({ id })) || member), emailed })
    }

    if (self) return NextResponse.json({ error: "You can't change your own hiring role" }, { status: 400 })
    const set: Partial<AtsMemberDoc> = { updated_at: nowIso() }
    const changes: string[] = []

    if (body.role !== undefined) {
      const role = parseRole(body.role)
      if (!role) return NextResponse.json({ error: 'Choose a role' }, { status: 400 })
      let clientId: string | null = null
      if (role === 'client' || role === 'hiring_manager') {
        const raw = body.client_id === undefined ? member.client_id ?? null : body.client_id
        clientId = raw == null || raw === '' ? null : parseId(raw)
        if (raw != null && raw !== '' && !clientId) return NextResponse.json({ error: 'Invalid client' }, { status: 400 })
        if (role === 'client' && !clientId) return NextResponse.json({ error: 'Pick the client this person belongs to' }, { status: 400 })
        if (clientId) {
          const c = await (await atsCollection('clients')).findOne({ id: clientId, tenant_id: actor.tenantId }, { projection: { id: 1 } })
          if (!c) return NextResponse.json({ error: 'Client not found' }, { status: 400 })
        }
      }
      set.role = role
      set.client_id = clientId
      changes.push(`role ${member.role}→${role}${clientId ? ` client ${clientId}` : ''}`)
    }

    if (body.status !== undefined) {
      if (body.status === 'disabled') {
        set.status = 'disabled'
        set.invite_nonce = null // kill any outstanding link
      } else if (body.status === 'active') {
        if (member.status !== 'disabled') return NextResponse.json({ error: 'Member is not disabled' }, { status: 400 })
        set.status = member.user_id ? 'active' : 'invited'
      } else {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      changes.push(`status ${member.status}→${set.status}`)
    }

    if (!changes.length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
    await col.updateOne({ id, tenant_id: actor.tenantId }, { $set: set })
    await auditAts(actor, 'ats.team.update', 'ats_member', id, `${member.email}: ${changes.join(', ')}`, req)
    return NextResponse.json({ member: publicMember((await col.findOne({ id })) || member) })
  } catch (e) {
    console.error('[ats/team/[id]] PATCH failed:', e)
    return NextResponse.json({ error: 'Could not update the member' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  const gate = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  try {
    const col = await atsMembers()
    const member = await col.findOne({ id, tenant_id: actor.tenantId })
    if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (member.user_id && member.user_id === actor.userId) return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 })
    await col.deleteOne({ id, tenant_id: actor.tenantId })
    await auditAts(actor, 'ats.team.remove', 'ats_member', id, `${member.email} (${member.role})`, req)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[ats/team/[id]] DELETE failed:', e)
    return NextResponse.json({ error: 'Could not remove the member' }, { status: 500 })
  }
}
