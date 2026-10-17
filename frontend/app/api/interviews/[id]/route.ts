import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions, nowIso } from '@/lib/db/interviews'
import { interviewPatch, interviewRole } from '@/lib/interview-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Participants, superadmin, or a tenant_admin of this session's tenant only.
  if (!interviewRole(gate.user, session as unknown as Record<string, unknown>)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return NextResponse.json(session)
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const role = interviewRole(gate.user, session as unknown as Record<string, unknown>)
  if (!role) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  // Feedback, scores and questions are the interviewer's (or tenant staff's);
  // the candidate can only start the session. Every value is type-checked.
  const patch = interviewPatch(role, await req.json().catch(() => ({})), nowIso())
  if ('error' in patch) return NextResponse.json({ error: patch.error }, { status: 403 })
  const $set = patch.set

  await col.updateOne({ id }, { $set })
  const updated = await col.findOne({ id })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  if (gate.user.role !== 'superadmin' && gate.user.role !== 'tenant_admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { id } = await ctx.params
  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
  // tenant_admin can only delete interviews in their own tenant
  if (gate.user.role === 'tenant_admin' && (!gate.user.tenantId || session.tenant_id !== gate.user.tenantId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  await (await interviewSessions()).deleteOne({ id })
  return NextResponse.json({ ok: true })
}
