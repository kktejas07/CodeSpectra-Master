/**
 * GET /api/workflows/[id]/runs?status=failed&limit=25 — run history (newest first).
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadWorkflow, requireWorkflowAdmin } from '@/lib/automation/access'
import { col } from '@/lib/automation/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = new Set(['success', 'failed', 'partial', 'running', 'waiting', 'cancelled'])

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const sp = req.nextUrl.searchParams
  const q: Record<string, unknown> = { workflow_id: wf.id }
  const status = sp.get('status')
  if (status && STATUSES.has(status)) q.status = status
  if (sp.get('test') === '0') q.dry_run = { $ne: true }
  const limit = Math.max(1, Math.min(100, Number(sp.get('limit')) || 25))
  const runs = await (await col('workflow_runs'))
    .find(q, { projection: { _id: 0, step_state: 0 } })
    .sort({ started_at: -1 })
    .limit(limit)
    .toArray()
  return NextResponse.json({ items: runs })
}
