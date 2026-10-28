/**
 * Who may build workflows, and on what (A-017).
 *   superadmin    platform workflows (tenant_id null) + any organisation's
 *   tenant_admin  their own organisation's workflows only; platform-only step
 *                 types (raw HTTP) and platform-only data are refused
 */
import 'server-only'
import { requireAdmin, type APIUser } from '@/lib/route-auth'
import type { WorkflowDoc } from '@/lib/db/leaderboard'
import { normalizeSteps, validateDefinition, type StepDef } from './steps-catalog'
import { conditionProblems, type Condition } from './conditions'
import { isEmittableEventType } from './event-types'
import { col } from './store'

export type WorkflowGate = { user: APIUser; tenantId: string | null; platform: boolean } | { error: string; status: 401 | 403 }

export async function requireWorkflowAdmin(): Promise<WorkflowGate> {
  const gate = await requireAdmin()
  if ('error' in gate || !gate.user) return { error: ('error' in gate && gate.error) || 'Forbidden', status: ('status' in gate && gate.status) || 403 }
  const platform = gate.user.role === 'superadmin'
  return { user: gate.user, tenantId: platform ? null : gate.user.tenantId ?? null, platform }
}

/** Mongo filter for the workflows a caller can see. */
export function workflowScope(g: { platform: boolean; tenantId: string | null }, requestedTenant?: string | null): Record<string, unknown> {
  if (!g.platform) return g.tenantId ? { tenant_id: g.tenantId } : { _id: null }
  const t = (requestedTenant || '').trim()
  if (t === 'platform') return { $or: [{ tenant_id: null }, { tenant_id: { $exists: false } }] }
  if (t && /^[A-Za-z0-9_-]{1,80}$/.test(t)) return { tenant_id: t }
  return {}
}

export async function loadWorkflow(g: { platform: boolean; tenantId: string | null }, id: string): Promise<WorkflowDoc | null> {
  if (!id || id.length > 80) return null
  const c = await col<WorkflowDoc>('workflows')
  return (await c.findOne({ id, ...workflowScope(g) }, { projection: { _id: 0 } })) as WorkflowDoc | null
}

export interface BuiltinOverlap {
  id: string
  title: string
  enabled: boolean
}

/**
 * For workflows made from a template that sends the same messages as a
 * built-in automation (AUTO-020): which built-in, and whether it is on.
 * Customers never get both (shared de-duplication keys); the UI offers to
 * switch the built-in off.
 */
export async function builtinOverlaps(wfs: Pick<WorkflowDoc, 'id' | 'template_id'>[]): Promise<Record<string, BuiltinOverlap>> {
  const out: Record<string, BuiltinOverlap> = {}
  const { templateById } = await import('./templates')
  const withTpl = wfs.map((w) => ({ w, tpl: w.template_id ? templateById(w.template_id) : undefined })).filter((x) => x.tpl?.replaces)
  if (!withTpl.length) return out
  const { systemAutomationById } = await import('./system/registry')
  const { isAutomationEnabled } = await import('./settings')
  for (const { w, tpl } of withTpl) {
    const a = systemAutomationById(tpl!.replaces!)
    if (a) out[w.id] = { id: a.id, title: a.title, enabled: await isAutomationEnabled(a.id, a.defaultOn !== false) }
  }
  return out
}

/** Never send secrets to the browser. */
export function publicWorkflow(wf: WorkflowDoc): Omit<WorkflowDoc, 'webhook_secret_enc'> & { has_webhook_secret: boolean } {
  const { webhook_secret_enc, ...rest } = wf
  return { ...rest, has_webhook_secret: !!webhook_secret_enc }
}

const TRIGGERS = ['manual', 'schedule', 'webhook', 'event'] as const

/**
 * Merge an update body into a workflow and validate the result. Returns the
 * $set fields or a list of problems.
 */
export function prepareWorkflowUpdate(current: Partial<WorkflowDoc>, body: Record<string, unknown>, opts: { platform: boolean }): { set: Partial<WorkflowDoc>; errors: string[] } {
  const set: Partial<WorkflowDoc> = {}
  const errors: string[] = []
  if ('name' in body) {
    const name = String(body.name ?? '').trim()
    if (!name || name.length > 120) errors.push('Name must be 1–120 characters')
    else set.name = name
  }
  if ('description' in body) set.description = String(body.description ?? '').slice(0, 1000)
  if ('trigger' in body) {
    if (!TRIGGERS.includes(body.trigger as (typeof TRIGGERS)[number])) errors.push('Unknown trigger')
    else set.trigger = body.trigger as WorkflowDoc['trigger']
  }
  if ('cron_expression' in body) set.cron_expression = String(body.cron_expression ?? '').trim().slice(0, 100)
  if ('event_type' in body) {
    const t = body.event_type
    if (t !== null && t !== '' && !isEmittableEventType(t)) errors.push('Unknown event type')
    else set.event_type = (t as string) || null
  }
  if ('event_filter' in body) {
    const f = body.event_filter
    if (f !== null && f !== undefined) {
      const p = conditionProblems(f)
      if (p.length) errors.push(...p.map((x) => `Trigger filter: ${x}`))
      else set.event_filter = f as Condition
    } else set.event_filter = null
  }
  if ('steps' in body) set.steps = normalizeSteps(body.steps)
  if ('is_active' in body) set.is_active = body.is_active === true
  if ('sample_payload' in body) {
    const sp = body.sample_payload
    if (sp !== null && (typeof sp !== 'object' || Array.isArray(sp))) errors.push('Sample payload must be a JSON object')
    else {
      const json = JSON.stringify(sp ?? {})
      if (json.length > 32_000) errors.push('Sample payload is too large (max 32 KB)')
      else set.sample_payload = (sp as Record<string, unknown>) ?? null
    }
  }
  // Legacy JSON editor fields (v1 graph) are still accepted.
  if ('nodes' in body && Array.isArray(body.nodes)) set.nodes = (body.nodes as WorkflowDoc['nodes']).slice(0, 60)
  if ('edges' in body && Array.isArray(body.edges)) set.edges = (body.edges as WorkflowDoc['edges']).slice(0, 120)

  const merged = { ...current, ...set }
  const steps: StepDef[] = merged.steps?.length ? merged.steps : (merged.nodes || []).map((n) => ({ id: n.id, type: n.type, label: n.label, config: n.config || {} }))
  errors.push(...validateDefinition({ trigger: String(merged.trigger || 'manual'), cron_expression: merged.cron_expression, event_type: merged.event_type, event_filter: merged.event_filter, steps }, opts))
  if (set.steps) set.version = 2
  return { set, errors }
}
