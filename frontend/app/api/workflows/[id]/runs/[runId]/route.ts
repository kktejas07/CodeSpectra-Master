/**
 *   GET  /api/workflows/[id]/runs/[runId]                      -> run with step logs
 *   POST /api/workflows/[id]/runs/[runId] { action: 'retry' }  -> re-run from the failed step
 *   POST /api/workflows/[id]/runs/[runId] { action: 'cancel' } -> stop a waiting run
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadWorkflow, requireWorkflowAdmin } from '@/lib/automation/access'
import { col } from '@/lib/automation/store'
import { cancelRun, rerunFromFailed } from '@/lib/automation/runs'
import { auditAdmin } from '@/lib/admin-audit'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ id: string; runId: string }> }

async function load(ctx: Ctx) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return { res: NextResponse.json({ error: g.error }, { status: g.status }) }
  const { id, runId } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return { res: NextResponse.json({ error: 'not found', code: 'not_found' }, { status: 404 }) }
  const run = await (await col('workflow_runs')).findOne({ id: runId, workflow_id: wf.id }, { projection: { _id: 0 } })
  if (!run) return { res: NextResponse.json({ error: 'run not found' }, { status: 404 }) }
  return { g, wf, run }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const r = await load(ctx)
  if ('res' in r) return r.res
  return NextResponse.json(r.run)
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const r = await load(ctx)
  if ('res' in r) return r.res
  const limited = await limitRequest(req, 'workflows:run', r.g.user.id, 30, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as { action?: unknown }
  if (body.action === 'retry') {
    if (r.run.dry_run) return NextResponse.json({ error: 'Start a new test run instead.' }, { status: 400 })
    const out = await rerunFromFailed(String(r.run.id), r.g.user.id)
    if (!out) return NextResponse.json({ error: 'Only failed runs can be re-run.' }, { status: 409 })
    await auditAdmin(r.g.user, 'workflow.rerun', 'workflow', r.wf.id, `run ${String(r.run.id)}`)
    return NextResponse.json(out)
  }
  if (body.action === 'cancel') {
    if (!(await cancelRun(String(r.run.id)))) return NextResponse.json({ error: 'This run is not waiting.' }, { status: 409 })
    await auditAdmin(r.g.user, 'workflow.cancel_run', 'workflow', r.wf.id, `run ${String(r.run.id)}`)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action', code: 'unknown_action' }, { status: 400 })
}
