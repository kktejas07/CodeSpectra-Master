/**
 * POST /api/workflows/[id]/run  { dry_run?: boolean, payload?: object }
 *
 * Starts a saved run with the given (or the workflow's sample) trigger
 * payload. `dry_run: true` is a test run: every step is checked and
 * previewed, but nothing is sent, written or waited for. Real runs need the
 * workflow switched on; test runs don't.
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadWorkflow, requireWorkflowAdmin } from '@/lib/automation/access'
import { startWorkflowRun } from '@/lib/automation/runs'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const limited = await limitRequest(req, 'workflows:run', g.user.id, 30, 60_000)
  if (limited) return limited
  const { id } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { dry_run?: unknown; payload?: unknown }
  const dryRun = body.dry_run === true
  if (!dryRun && !wf.is_active) return NextResponse.json({ error: 'Switch the workflow on first, or use a test run.' }, { status: 400 })
  let payload: Record<string, unknown> = wf.sample_payload || {}
  if (body.payload !== undefined) {
    if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) return NextResponse.json({ error: 'payload must be a JSON object' }, { status: 400 })
    if (JSON.stringify(body.payload).length > 32_000) return NextResponse.json({ error: 'payload is too large (max 32 KB)' }, { status: 400 })
    payload = body.payload as Record<string, unknown>
  }
  try {
    const { run } = await startWorkflowRun(wf, { trigger: 'manual', actorId: g.user.id, payload, dryRun })
    return NextResponse.json(run, { status: 200 })
  } catch (e) {
    console.error('[workflows/run] failed:', e)
    return NextResponse.json({ error: 'Run failed to start' }, { status: 500 })
  }
}
