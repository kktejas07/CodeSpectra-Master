/**
 * /api/admin/integrity/[kind]/[id]/report — similarity clusters + AI-written signals.
 *   GET    the stored report
 *   POST   run the check now (lease-locked; 409 while one is running)
 *   PATCH  { cluster_id, status, note? } — reviewer's mark on a cluster
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/route-auth'
import { loadStaffTarget } from '@/lib/integrity/service'
import { getReport, runReport, setClusterReview } from '@/lib/integrity/similarity-job'
import { rateLimitSlidingWindow } from '@/lib/in-memory-rate-limit'
import { auditAdmin } from '@/lib/admin-audit'
import { errorBody } from '@/lib/services/result'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type Ctx = { params: Promise<{ kind: string; id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id } = await ctx.params
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    return NextResponse.json({ report: await getReport(t.data) })
  } catch (e) {
    console.error('[admin/integrity/report] GET failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not load the report' }, { status: 500 })
  }
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id } = await ctx.params
  const rl = rateLimitSlidingWindow(`integrity-report:${gate.user.id}`, 6, 10 * 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many runs. Try again in a few minutes.' }, { status: 429 })
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const r = await runReport(t.data, 'manual')
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    await auditAdmin(gate.user, 'integrity.report.run', t.data.kind, t.data.id)
    return NextResponse.json({ report: r.data })
  } catch (e) {
    console.error('[admin/integrity/report] POST failed:', (e as Error).message)
    return NextResponse.json({ error: 'The check failed' }, { status: 500 })
  }
}

const Patch = z.object({
  cluster_id: z.string().max(40),
  status: z.enum(['unreviewed', 'reviewed', 'cleared', 'flagged']),
  note: z.string().max(2000).optional(),
}).strict()

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { kind, id } = await ctx.params
  const p = Patch.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Choose reviewed, cleared or flagged.' }, { status: 400 })
  try {
    const t = await loadStaffTarget(gate.user, kind, id)
    if (!t.ok) return NextResponse.json(errorBody(t), { status: t.status })
    const r = await setClusterReview(gate.user, t.data, p.data.cluster_id, p.data.status, p.data.note ?? '')
    if (!r.ok) return NextResponse.json(errorBody(r), { status: r.status })
    await auditAdmin(gate.user, 'integrity.cluster.review', t.data.kind, `${t.data.id}:${p.data.cluster_id}`, p.data.status)
    return NextResponse.json({ review: r.data })
  } catch (e) {
    console.error('[admin/integrity/report] PATCH failed:', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the review' }, { status: 500 })
  }
}
