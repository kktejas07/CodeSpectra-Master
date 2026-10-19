/**
 * Workflows (superadmin: platform + any organisation; tenant_admin: own organisation).
 *   GET  /api/workflows[?tenant=platform|<id>]  -> { items, quota? }
 *   POST /api/workflows { name, template_id?, tenant_id? (superadmin) } -> created (paused when from a template)
 */
import { NextRequest, NextResponse } from 'next/server'
import { newId, nowIso, type WorkflowDoc } from '@/lib/db/leaderboard'
import { publicWorkflow, requireWorkflowAdmin, workflowScope } from '@/lib/automation/access'
import { col } from '@/lib/automation/store'
import { templateById } from '@/lib/automation/templates'
import { MAX_TENANT_WORKFLOWS, quotaUsage } from '@/lib/automation/quotas'
import { OLD_SEED_NAMES, STARTER_WORKFLOWS } from '@/lib/automation/seeds'
import { auditAdmin } from '@/lib/admin-audit'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Seed the starter platform workflows once; upgrade untouched copies of the old broken seeds (A-014). */
async function seedPlatformWorkflows(): Promise<void> {
  try {
    const c = await col<WorkflowDoc>('workflows')
    const ts = nowIso()
    const count = await c.countDocuments({})
    if (count === 0) {
      await c.insertMany(STARTER_WORKFLOWS.map((s) => ({ ...s, id: newId(), version: 2 as const, nodes: [], edges: [], is_active: false, tenant_id: null, created_by: 'system', created_at: ts, updated_at: ts })))
      return
    }
    const old = await c.find({ created_by: 'system', name: { $in: [...OLD_SEED_NAMES] }, steps: { $exists: false } }, { projection: { id: 1, name: 1 } }).toArray()
    for (const o of old) {
      const s = STARTER_WORKFLOWS.find((x) => x.name === o.name)
      if (!s) continue
      await c.updateOne({ id: o.id, steps: { $exists: false } }, { $set: { ...s, version: 2, nodes: [], edges: [], updated_at: ts } })
    }
  } catch {
    /* seeding is best-effort */
  }
}

export async function GET(req: NextRequest) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (g.platform) await seedPlatformWorkflows()
  const c = await col<WorkflowDoc>('workflows')
  const items = (await c.find(workflowScope(g, req.nextUrl.searchParams.get('tenant')), { projection: { _id: 0 } }).sort({ created_at: -1 }).limit(500).toArray()) as WorkflowDoc[]
  return NextResponse.json({
    items: items.map(publicWorkflow),
    scope: g.platform ? 'platform' : 'tenant',
    ...(g.tenantId ? { quota: await quotaUsage(g.tenantId), max_workflows: MAX_TENANT_WORKFLOWS } : {}),
  })
}

export async function POST(req: NextRequest) {
  const g = await requireWorkflowAdmin()
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  const limited = await limitRequest(req, 'workflows:create', g.user.id, 30, 60 * 60_000)
  if (limited) return limited
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const name = String(body.name ?? '').trim()
  const tpl = typeof body.template_id === 'string' ? templateById(body.template_id) : undefined
  if (body.template_id && !tpl) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })
  if (tpl?.platformOnly && !g.platform) return NextResponse.json({ error: 'This template is only available to platform admins' }, { status: 403 })
  if (!name && !tpl) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (name.length > 120) return NextResponse.json({ error: 'Name is too long' }, { status: 400 })

  const tenantId = g.platform ? (typeof body.tenant_id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(body.tenant_id) ? body.tenant_id : null) : g.tenantId
  const c = await col<WorkflowDoc>('workflows')
  if (tenantId && (await c.countDocuments({ tenant_id: tenantId })) >= MAX_TENANT_WORKFLOWS) {
    return NextResponse.json({ error: `Your organisation can keep up to ${MAX_TENANT_WORKFLOWS} workflows. Delete one first.` }, { status: 409 })
  }
  const ts = nowIso()
  const doc: WorkflowDoc = tpl
    ? {
        id: newId(), name: name || tpl.name, description: tpl.description, trigger: tpl.trigger, cron_expression: tpl.cron_expression,
        event_type: tpl.event_type ?? null, event_filter: tpl.event_filter ?? null, steps: structuredClone(tpl.steps), version: 2,
        sample_payload: tpl.sample_payload, template_id: tpl.id, nodes: [], edges: [], is_active: false,
        tenant_id: tenantId, created_by: g.user.id, created_at: ts, updated_at: ts,
      }
    : {
        id: newId(), name, description: String(body.description ?? '').slice(0, 1000), trigger: 'manual', version: 2,
        steps: [{ id: 'note_1', type: 'log', label: 'Write a note', config: { message: 'Hello from {{workflow.name}}' } }],
        sample_payload: {}, nodes: [], edges: [], is_active: false,
        tenant_id: tenantId, created_by: g.user.id, created_at: ts, updated_at: ts,
      }
  await c.insertOne(doc)
  await auditAdmin(g.user, 'workflow.create', 'workflow', doc.id, `${doc.name}${tpl ? ` (template ${tpl.id})` : ''}`)
  const { _id: _ignored, ...clean } = doc as WorkflowDoc & { _id?: unknown }
  void _ignored
  return NextResponse.json(publicWorkflow(clean as WorkflowDoc), { status: 201 })
}
