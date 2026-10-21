/**
 * /api/admin/integrity/[kind]/[id]/attempts/[attemptId]
 *   GET    trust score, timeline, snapshot list, typing summaries
 *   PATCH  { status: 'unreviewed'|'reviewed'|'cleared'|'flagged', note? } — reviewer's mark (never changes a score)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { attemptDetail, loadStaffTarget, setAttemptReview } from '@/lib/integrity/service'
import { auditAdmin } from '@/lib/admin-audit'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string; id: string; attemptId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id, attemptId } = await ctx.params
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const r = await attemptDetail(t.data, attemptId)
    return r.ok ? NextResponse.json(r.data) : NextResponse.json(errorBody(r), { status: r.status })
  } catch (e) {
    console.error('[admin/integrity/attempt] GET failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the attempt' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id, attemptId } = await ctx.params
  const body = await req.json().catch(() => null)
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const r = await setAttemptReview(gate.user, t.data, attemptId, body)
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    await auditAdmin(gate.user, 'integrity.attempt.review', t.data.kind, `${t.data.id}:${attemptId}`, r.data.status)
    return NextResponse.json({ review: r.data })
  } catch (e) {
    console.error('[admin/integrity/attempt] PATCH failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the review' }, { status: 500 })
  }
}
