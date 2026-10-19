/**
 * One workflow (scoped: tenant admins only reach their organisation's).
 *   GET    /api/workflows/[id]   -> workflow (+ inbound webhook URL)
 *   PATCH  /api/workflows/[id]   -> validated update (name, trigger, steps, filter, active…)
 *   DELETE /api/workflows/[id]   -> remove (waiting runs are cancelled)
 * Every change is written to the admin audit log.
 */
import { NextRequest, NextResponse } from 'next/server'
import { nowIso, type WorkflowDoc } from '@/lib/db/leaderboard'
import { loadWorkflow, prepareWorkflowUpdate, publicWorkflow, requireWorkflowAdmin } from '@/lib/automation/access'
import { col } from '@/lib/automation/store'
import { auditAdmin } from '@/lib/admin-audit'
import { getAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ...publicWorkflow(wf), hook_url: `${getAppOrigin()}/api/workflows/hooks/${wf.id}` })
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const { set, errors } = prepareWorkflowUpdate(wf, body, { platform: g.platform && !wf.tenant_id })
  // A workflow that can't run can still be saved as a draft, but not switched on.
  const turningOn = (set.is_active ?? wf.is_active) === true
  if (errors.length && turningOn) {
    return NextResponse.json({ error: errors[0], errors }, { status: 400 })
  }
  if ((set.trigger ?? wf.trigger) === 'webhook' && turningOn && !wf.webhook_secret_enc) {
    return NextResponse.json({ error: 'Create the webhook signing secret before switching this workflow on.' }, { status: 400 })
  }
  const c = await col<WorkflowDoc>('workflows')
  await c.updateOne({ id: wf.id }, { $set: { ...set, updated_at: nowIso(), updated_by: g.user.id } })
  const changed = Object.keys(set).join(', ')
  await auditAdmin(g.user, 'is_active' in body && set.is_active !== wf.is_active ? (set.is_active ? 'workflow.enable' : 'workflow.disable') : 'workflow.update', 'workflow', wf.id, `${wf.name}: ${changed}`.slice(0, 480))
  const updated = (await c.findOne({ id: wf.id }, { projection: { _id: 0 } })) as WorkflowDoc
  return NextResponse.json({ ...publicWorkflow(updated), ...(errors.length ? { warnings: errors } : {}) })
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const { id } = await ctx.params
  const wf = await loadWorkflow(g, id)
  if (!wf) return NextResponse.json({ error: 'not found' }, { status: 404 })
  await (await col('workflows')).deleteOne({ id: wf.id })
  await (await col('workflow_runs')).updateMany({ workflow_id: wf.id, status: { $in: ['waiting', 'running'] } }, { $set: { status: 'cancelled', finished_at: nowIso(), error: 'Workflow was deleted' } })
  await auditAdmin(g.user, 'workflow.delete', 'workflow', wf.id, wf.name, 'warning')
  return NextResponse.json({ ok: true })
}
