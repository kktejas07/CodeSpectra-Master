import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions, nowIso } from '@/lib/db/interviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id } = await ctx.params

  const col = await interviewSessions()
  const session = await col.findOne({ id })
  if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const userId = gate.user.id
  const role = gate.user.role
  const isParticipant = session.interviewer_id === userId || session.candidate_id === userId
  if (!isParticipant && role !== 'superadmin' && role !== 'tenant_admin') {
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

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const $set: Record<string, unknown> = { updated_at: nowIso() }

  if (body.status && ['scheduled', 'in_progress', 'completed', 'cancelled'].includes(body.status as string)) {
    $set.status = body.status
    if (body.status === 'in_progress') $set.started_at = nowIso()
    if (body.status === 'completed') $set.completed_at = nowIso()
  }
  if (body.notes) $set.notes = body.notes
  if (body.feedback) $set.feedback = body.feedback
  if (body.overall_score) $set.overall_score = body.overall_score
  if (body.scheduled_at) $set.scheduled_at = body.scheduled_at
  if (body.questions) $set.questions = body.questions

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
  await (await interviewSessions()).deleteOne({ id })
  return NextResponse.json({ ok: true })
}
