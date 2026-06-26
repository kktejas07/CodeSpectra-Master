/**
 * POST /api/workflows/[id]/run
 *
 * Executes the workflow synchronously and persists the run log into
 * `workflow_runs`. Superadmin only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import {
  workflows,
  workflowRuns,
  newId,
  nowIso,
} from '@/lib/db/leaderboard'
import { executeWorkflow } from '@/lib/workflow-engine'

export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const { id } = await ctx.params

  const wfCol = await workflows()
  const wf = await wfCol.findOne({ id })
  if (!wf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!wf.is_active) {
    return NextResponse.json({ error: 'workflow inactive' }, { status: 400 })
  }

  const started = nowIso()
  const result = await executeWorkflow(wf)
  const finished = nowIso()

  const runsCol = await workflowRuns()
  const runDoc = {
    id: newId(),
    workflow_id: wf.id,
    user_id: gate.user.id,
    status: result.status,
    started_at: started,
    finished_at: finished,
    steps: result.steps,
    duration_ms: result.duration_ms,
  }
  await runsCol.insertOne(runDoc)

  return NextResponse.json(runDoc, { status: 200 })
}
