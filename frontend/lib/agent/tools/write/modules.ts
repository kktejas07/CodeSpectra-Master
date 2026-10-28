/**
 * Write tools for the newer modules — every one only proposes; execute()
 * re-checks access and calls the same lib/* service the admin UI uses.
 *  - marketplace (superadmin): product moderation, refund + payout decisions (risk 'money')
 *  - Learn hub (superadmin): generate a draft, approve / publish / unpublish / reject
 *  - events feed (superadmin): feature / hide / archive / publish an event
 *  - automations: install a template (switched OFF), switch a workflow on/off,
 *    re-run a failed run, schedule a copilot task (a schedule workflow)
 *  - codeathons + problems: update, publish
 */
import { ToolInputError, ToolPermissionError } from '@/lib/agent/contract'
import { writeTool } from '../define'
import {
  argsObject, optBool, optDate, optEnum, optInt, optString, optStringArray, reqId, reqString,
} from '../args'
import { clip } from '../output'
import { atsCall } from '../ats-shared'
import { assertCanManage, serviceUser } from '../scope'
import { workflowGateFor } from '../read/modules'
import { REPORT_SOURCES, WEEKDAYS, buildScheduledWorkflow, parseTime, type ReportSource, type ScheduleFrequency, type Weekday } from '@/lib/agent/schedule'

type Doc = Record<string, any>
const SUPER = ['superadmin'] as const
const money = (minor: unknown, currency: unknown) => (typeof minor === 'number' ? `${(minor / 100).toFixed(2)} ${String(currency || '')}`.trim() : '—')

async function adminAudit(actorId: string, action: string, type: string, id: string, detail: string) {
  const { auditAdmin } = await import('@/lib/admin-audit')
  await auditAdmin({ id: actorId }, action, type, id, `${detail} (via AI copilot)`.slice(0, 480), 'info').catch(() => undefined)
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

export const moderateProductTool = writeTool<{ product_id: string; decision: 'approve' | 'reject' | 'unpublish'; note?: string }>({
  name: 'moderate_product',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Approve a marketplace product waiting for review (it goes live), reject it, or unpublish a live one. Reject / unpublish need a reason for the seller.',
  parameters: {
    type: 'object',
    properties: { product_id: { type: 'string' }, decision: { type: 'string', enum: ['approve', 'reject', 'unpublish'] }, note: { type: 'string', maxLength: 1000 } },
    required: ['product_id', 'decision'],
  },
  parse(raw) {
    const r = argsObject(raw, ['product_id', 'decision', 'note'])
    const decision = optEnum(r, 'decision', ['approve', 'reject', 'unpublish'] as const)
    if (!decision) throw new ToolInputError('`decision` is required.')
    const note = optString(r, 'note', { max: 1000 })
    if (decision !== 'approve' && !note) throw new ToolInputError('Add a `note` with the reason for the seller.')
    return { product_id: reqId(r, 'product_id'), decision, ...(note ? { note } : {}) }
  },
  async propose(a) {
    const [{ productsCol }, { nextProductStatus }] = await Promise.all([import('@/lib/marketplace/db'), import('@/lib/marketplace/moderation')])
    const p = (await (await productsCol()).findOne({ id: a.product_id }, { projection: { _id: 0 } })) as Doc | null
    if (!p) throw new ToolInputError('Product not found. Use list_marketplace_products.')
    const to = nextProductStatus(p.status, a.decision)
    if (!to) throw new ToolInputError(`Can't ${a.decision} a product that is ${String(p.status).replace('_', ' ')}.`)
    return { title: `${a.decision[0].toUpperCase()}${a.decision.slice(1)} product “${clip(p.title, 80)}”`, preview: { product: p.title, seller_id: p.seller_id, price: money(p.price, p.currency), status: { from: p.status, to }, note: a.note ?? '—', effect: 'The seller is notified.' } }
  },
  async execute(a, ctx) {
    const { decideProduct } = await import('@/lib/marketplace/moderation')
    const p = await atsCall(() => decideProduct(ctx.caller.userId, a.product_id, a.decision, a.note ?? null))
    return { ok: true, message: `“${p.title}” is now ${p.status.replace('_', ' ')}.`, link: '/dashboard/admin/marketplace?tab=products' }
  },
})

export const decideRefundTool = writeTool<{ refund_id: string; decision: 'approve' | 'reject'; amount?: number; note?: string }>({
  name: 'decide_refund',
  risk: 'money',
  roles: [...SUPER],
  description: 'Approve (refund the buyer through the payment gateway) or reject a marketplace refund request. `amount` is in minor units (paise / cents) and defaults to the requested amount. Reject needs a note.',
  parameters: {
    type: 'object',
    properties: { refund_id: { type: 'string' }, decision: { type: 'string', enum: ['approve', 'reject'] }, amount: { type: 'integer', minimum: 1 }, note: { type: 'string', maxLength: 1000 } },
    required: ['refund_id', 'decision'],
  },
  parse(raw) {
    const r = argsObject(raw, ['refund_id', 'decision', 'amount', 'note'])
    const decision = optEnum(r, 'decision', ['approve', 'reject'] as const)
    if (!decision) throw new ToolInputError('`decision` is required.')
    const note = optString(r, 'note', { max: 1000 })
    if (decision === 'reject' && !note) throw new ToolInputError('Add a `note` with the reason for the buyer.')
    const amount = optInt(r, 'amount', 1, 1e10)
    return { refund_id: reqId(r, 'refund_id'), decision, ...(amount ? { amount } : {}), ...(note ? { note } : {}) }
  },
  async propose(a) {
    const { refundsCol } = await import('@/lib/marketplace/db')
    const r = (await (await refundsCol()).findOne({ id: a.refund_id }, { projection: { _id: 0 } })) as Doc | null
    if (!r) throw new ToolInputError('Refund request not found. Use list_marketplace_orders.')
    if (r.status !== 'open') throw new ToolInputError(`This request is already ${r.status}.`)
    if (a.amount && a.amount > r.amount) throw new ToolInputError(`The amount is more than requested (${money(r.amount, r.currency)}).`)
    return {
      title: a.decision === 'approve' ? `Refund ${money(a.amount ?? r.amount, r.currency)} on order ${r.order_id}` : `Reject refund request for order ${r.order_id}`,
      preview: { order_id: r.order_id, type: r.type, requested: money(r.amount, r.currency), refund: a.decision === 'approve' ? money(a.amount ?? r.amount, r.currency) : '—', reason_given: clip(r.reason, 300), note: a.note ?? '—', effect: a.decision === 'approve' ? 'Money goes back to the buyer through the payment gateway. This cannot be undone.' : 'The buyer is told it was declined.' },
    }
  },
  async execute(a, ctx) {
    const { decideRefund } = await import('@/lib/marketplace/moderation')
    const r = await atsCall(() => decideRefund(ctx.caller.userId, a.refund_id, a.decision, { amount: a.amount ?? null, note: a.note ?? null }))
    return { ok: true, message: a.decision === 'approve' ? `Refund ${r.status === 'refunded' ? 'sent' : r.status}${r.via ? ` via ${r.via}` : ''}.` : 'Refund request declined.', link: `/dashboard/admin/marketplace?tab=refunds` }
  },
})

export const decidePayoutTool = writeTool<{ payout_id: string; action: 'approve' | 'paid' | 'failed'; ref?: string; reason?: string }>({
  name: 'decide_payout',
  risk: 'money',
  roles: [...SUPER],
  description: 'Seller payout decision: approve it (Stripe Connect payouts transfer money), mark a manual payout as paid (needs the bank / UPI reference), or mark it failed (needs a reason).',
  parameters: {
    type: 'object',
    properties: { payout_id: { type: 'string' }, action: { type: 'string', enum: ['approve', 'paid', 'failed'] }, ref: { type: 'string', maxLength: 120 }, reason: { type: 'string', maxLength: 500 } },
    required: ['payout_id', 'action'],
  },
  parse(raw) {
    const r = argsObject(raw, ['payout_id', 'action', 'ref', 'reason'])
    const action = optEnum(r, 'action', ['approve', 'paid', 'failed'] as const)
    if (!action) throw new ToolInputError('`action` is required.')
    const ref = optString(r, 'ref', { max: 120 })
    const reason = optString(r, 'reason', { max: 500 })
    if (action === 'paid' && !ref) throw new ToolInputError('Give the payment `ref` (bank / UPI reference).')
    if (action === 'failed' && !reason) throw new ToolInputError('Give a `reason`.')
    return { payout_id: reqId(r, 'payout_id'), action, ...(ref ? { ref } : {}), ...(reason ? { reason } : {}) }
  },
  async propose(a) {
    const [{ payoutsCol }, { nextPayoutStatus }] = await Promise.all([import('@/lib/marketplace/db'), import('@/lib/marketplace/payouts')])
    const p = (await (await payoutsCol()).findOne({ id: a.payout_id }, { projection: { _id: 0, destination: 0 } })) as Doc | null
    if (!p) throw new ToolInputError('Payout not found. Use list_marketplace_payouts.')
    const to = nextPayoutStatus(p.status, a.action)
    if (!to) throw new ToolInputError(`Can't mark a ${p.status} payout as ${a.action}.`)
    return { title: `${a.action === 'approve' ? 'Approve' : a.action === 'paid' ? 'Mark paid' : 'Mark failed'}: payout of ${money(p.amount, p.currency)} to seller ${p.seller_id}`, preview: { seller_id: p.seller_id, amount: money(p.amount, p.currency), method: p.method, status: { from: p.status, to }, ref: a.ref ?? '—', reason: a.reason ?? '—', effect: a.action === 'approve' && p.method === 'stripe_connect' ? 'Starts a Stripe transfer to the seller.' : 'Updates the payout and the seller ledger.' } }
  },
  async execute(a, ctx) {
    const { decidePayout } = await import('@/lib/marketplace/payouts')
    const p = await atsCall(() => decidePayout(ctx.caller.userId, a.payout_id, a.action, { ref: a.ref ?? null, reason: a.reason ?? null }))
    return { ok: true, message: `Payout is now ${p.status}.`, link: '/dashboard/admin/marketplace?tab=payouts' }
  },
})

// ─── Learn hub ───────────────────────────────────────────────────────────────

export const generateLearnDraftTool = writeTool<{ topic_id?: string; count?: number }>({
  name: 'generate_learn_draft',
  risk: 'create',
  roles: [...SUPER],
  description: 'Have the Learn generator research and write draft post(s) — for one topic, or the next topics in the plan (up to 3). Drafts are never published without an approval.',
  parameters: { type: 'object', properties: { topic_id: { type: 'string' }, count: { type: 'integer', minimum: 1, maximum: 3 } } },
  parse(raw) {
    const r = argsObject(raw, ['topic_id', 'count'])
    const count = optInt(r, 'count', 1, 3)
    return { ...(r.topic_id ? { topic_id: reqId(r, 'topic_id') } : {}), ...(count ? { count } : {}) }
  },
  async propose(a) {
    const [{ learnTopics }, { planNext }] = await Promise.all([import('@/lib/learn/store'), import('@/lib/learn/generate')])
    const topics = a.topic_id
      ? ((await (await learnTopics()).find({ id: a.topic_id }, { projection: { _id: 0, id: 1, title: 1, category: 1 } }).toArray()) as Doc[])
      : ((await planNext(a.count ?? 1)) as unknown as Doc[])
    if (!topics.length) throw new ToolInputError(a.topic_id ? 'Topic not found. Use list_learn_topics.' : 'Every enabled topic already has a post. Add topics first.')
    return { title: `Write ${topics.length} Learn draft${topics.length === 1 ? '' : 's'}`, preview: { topics: topics.map((t) => ({ title: t.title, category: t.category })), effect: 'Researches allowed sources and saves drafts for review. Nothing is published.' } }
  },
  async execute(a, ctx) {
    const { generateNow } = await import('@/lib/learn/generate')
    const results = await generateNow({ count: a.count ?? 1, topicId: a.topic_id ?? null, actorId: ctx.caller.userId })
    const ok = results.filter((r) => r.ok)
    return { ok: ok.length > 0, message: ok.length ? `Wrote ${ok.length} draft${ok.length === 1 ? '' : 's'}: ${ok.map((r) => r.topic).join(', ')}.` : `No draft was written: ${results.map((r) => r.error).filter(Boolean).join('; ').slice(0, 300)}`, link: '/dashboard/admin/learn', data: { posts: ok.map((r) => r.postId) } }
  },
})

export const setLearnPostStatusTool = writeTool<{ post_id: string; action: 'approve' | 'publish' | 'schedule' | 'unpublish' | 'reject' | 'reopen'; publish_at?: string; reason?: string }>({
  name: 'set_learn_post_status',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Move a Learn post through review: approve, publish (now), schedule (with publish_at), unpublish, reject (needs a reason) or reopen.',
  parameters: {
    type: 'object',
    properties: {
      post_id: { type: 'string' },
      action: { type: 'string', enum: ['approve', 'publish', 'schedule', 'unpublish', 'reject', 'reopen'] },
      publish_at: { type: 'string', description: 'ISO date-time for schedule.' },
      reason: { type: 'string', maxLength: 500 },
    },
    required: ['post_id', 'action'],
  },
  parse(raw) {
    const r = argsObject(raw, ['post_id', 'action', 'publish_at', 'reason'])
    const action = optEnum(r, 'action', ['approve', 'publish', 'schedule', 'unpublish', 'reject', 'reopen'] as const)
    if (!action) throw new ToolInputError('`action` is required.')
    const at = optDate(r, 'publish_at')
    const reason = optString(r, 'reason', { max: 500 })
    if (action === 'schedule' && !at) throw new ToolInputError('`publish_at` is required to schedule.')
    if (action === 'reject' && !reason) throw new ToolInputError('`reason` is required to reject.')
    return { post_id: reqId(r, 'post_id'), action, ...(at ? { publish_at: at } : {}), ...(reason ? { reason } : {}) }
  },
  async propose(a) {
    const [{ learnPosts }, { allowedActions }] = await Promise.all([import('@/lib/learn/store'), import('@/lib/learn/state')])
    const p = (await (await learnPosts()).findOne({ id: a.post_id }, { projection: { _id: 0, id: 1, title: 1, status: 1, quality: 1, summary: 1 } })) as Doc | null
    if (!p) throw new ToolInputError('Post not found. Use list_learn_posts.')
    if (!allowedActions(p.status).includes(a.action)) throw new ToolInputError(`A ${p.status} post can't be ${a.action}d. Allowed: ${allowedActions(p.status).join(', ') || 'none'}.`)
    return { title: `${a.action[0].toUpperCase()}${a.action.slice(1)} Learn post “${clip(p.title, 80)}”`, preview: { post: p.title, status: p.status, action: a.action, publish_at: a.publish_at ?? '—', reason: a.reason ?? '—', quality_score: p.quality?.score ?? null, flags: p.quality?.flags ?? [], summary: clip(p.summary, 300) } }
  },
  async execute(a, ctx) {
    const { applyPostAction } = await import('@/lib/learn/posts')
    const r = await applyPostAction(a.post_id, a.action, { reason: a.reason, publishAt: a.publish_at, actorId: ctx.caller.userId })
    if (r.error || !r.post) return { ok: false, message: r.error || 'That did not work.' }
    await adminAudit(ctx.caller.userId, `learn.post.${a.action}`, 'learn_post', a.post_id, r.post.title)
    return { ok: true, message: `“${r.post.title}” is now ${r.post.status}.`, link: '/dashboard/admin/learn' }
  },
})

// ─── Events feed ─────────────────────────────────────────────────────────────

export const setFeedEventVisibilityTool = writeTool<{ event_id: string; featured?: boolean; status?: 'published' | 'hidden' | 'archived' }>({
  name: 'set_feed_event_visibility',
  risk: 'publish',
  roles: [...SUPER],
  description: 'Feature / un-feature an events-feed event, or hide, archive or re-publish it.',
  parameters: {
    type: 'object',
    properties: { event_id: { type: 'string' }, featured: { type: 'boolean' }, status: { type: 'string', enum: ['published', 'hidden', 'archived'] } },
    required: ['event_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['event_id', 'featured', 'status'])
    const featured = optBool(r, 'featured')
    const status = optEnum(r, 'status', ['published', 'hidden', 'archived'] as const)
    if (featured === undefined && !status) throw new ToolInputError('Give `featured` and/or `status`.')
    return { event_id: reqString(r, 'event_id', { max: 128 }), ...(featured !== undefined ? { featured } : {}), ...(status ? { status } : {}) }
  },
  async propose(a) {
    const { getFeedEvent } = await import('@/lib/events-feed/query')
    const e = (await getFeedEvent(a.event_id)) as Doc | null
    if (!e) throw new ToolInputError('Event not found. Use search_feed_events.')
    return { title: `${a.status ? `${a.status === 'published' ? 'Publish' : a.status === 'hidden' ? 'Hide' : 'Archive'}` : a.featured ? 'Feature' : 'Un-feature'} event “${clip(e.title, 80)}”`, preview: { event: e.title, organiser: e.organiser, status: a.status ? { from: e.status, to: a.status } : e.status, featured: a.featured !== undefined ? { from: !!e.featured, to: a.featured } : !!e.featured } }
  },
  async execute(a, ctx) {
    const { editEvent } = await import('@/lib/events-feed/admin')
    const r = await editEvent(a.event_id, { ...(a.status ? { status: a.status } : {}), ...(a.featured !== undefined ? { featured: a.featured } : {}) })
    if (!r.ok) return { ok: false, message: r.error || 'That did not work.' }
    await adminAudit(ctx.caller.userId, 'events_feed.edit', 'feed_event', a.event_id, JSON.stringify({ status: a.status, featured: a.featured }))
    return { ok: true, message: 'Updated the event.', link: '/dashboard/admin/events-feed' }
  },
})

// ─── Automations ─────────────────────────────────────────────────────────────

/** Same availability rule as the templates gallery (lib/automation/templates; falls back to platformOnly). */
function templateAllowed(mod: Record<string, unknown>, t: { platformOnly?: boolean; trigger: string; event_type?: string }, platform: boolean): boolean {
  const fn = mod.templateAvailableTo as ((t: unknown, platform: boolean) => boolean) | undefined
  return typeof fn === 'function' ? fn(t, platform) : platform || !t.platformOnly
}

async function loadWorkflowFor(caller: { role: string; tenantId: string | null }, id: string): Promise<Doc> {
  const { loadWorkflow } = await import('@/lib/automation/access')
  const wf = await loadWorkflow(workflowGateFor(caller), id)
  if (!wf) throw new ToolPermissionError('Workflow not found. Use list_workflows.')
  return wf as unknown as Doc
}

export const createWorkflowFromTemplateTool = writeTool<{ template_id: string; name?: string }>({
  name: 'create_workflow_from_template',
  risk: 'create',
  description: 'Install a workflow template for your organisation. It is saved switched OFF so you can review and fill in its setup before enabling it (set_workflow_enabled).',
  parameters: { type: 'object', properties: { template_id: { type: 'string' }, name: { type: 'string', maxLength: 120 } }, required: ['template_id'] },
  parse(raw) {
    const r = argsObject(raw, ['template_id', 'name'])
    const name = optString(r, 'name', { max: 120 })
    return { template_id: reqString(r, 'template_id', { max: 80 }), ...(name ? { name } : {}) }
  },
  async propose(a, ctx) {
    const tpl = await import('@/lib/automation/templates')
    const t = tpl.templateById(a.template_id)
    const g = workflowGateFor(ctx.caller)
    if (!t) throw new ToolInputError('Unknown template. Use list_workflow_templates.')
    if (!templateAllowed(tpl, t, g.platform)) throw new ToolPermissionError('This template is only available to platform admins.')
    return { title: `Install workflow “${clip(a.name || t.name, 80)}” (switched off)`, preview: { template: t.name, category: t.category, trigger: t.trigger, schedule: t.cron_expression ?? null, event: t.event_type ?? null, steps: t.steps.map((s) => s.label || s.type), setup: t.setup ?? '—', status: 'Off until you enable it' } }
  },
  async execute(a, ctx) {
    const [tpl, { col }, { MAX_TENANT_WORKFLOWS }, { newId, nowIso }] = await Promise.all([
      import('@/lib/automation/templates'), import('@/lib/automation/store'), import('@/lib/automation/quotas'), import('@/lib/db/leaderboard'),
    ])
    const t = tpl.templateById(a.template_id)
    const g = workflowGateFor(ctx.caller)
    if (!t) return { ok: false, message: 'Unknown template.' }
    if (!templateAllowed(tpl, t, g.platform)) return { ok: false, message: 'This template is only available to platform admins.' }
    const c = await col('workflows')
    if (g.tenantId && (await c.countDocuments({ tenant_id: g.tenantId })) >= MAX_TENANT_WORKFLOWS) return { ok: false, message: `Your organisation can keep up to ${MAX_TENANT_WORKFLOWS} workflows. Delete one first.` }
    const ts = nowIso()
    const doc = {
      id: newId(), name: a.name || t.name, description: t.description, trigger: t.trigger, cron_expression: t.cron_expression,
      event_type: t.event_type ?? null, event_filter: t.event_filter ?? null, steps: structuredClone(t.steps), version: 2 as const,
      sample_payload: t.sample_payload, template_id: t.id, nodes: [], edges: [], is_active: false,
      tenant_id: g.tenantId, created_by: ctx.caller.userId, created_at: ts, updated_at: ts,
    }
    await c.insertOne(doc)
    await adminAudit(ctx.caller.userId, 'workflow.create', 'workflow', doc.id, `${doc.name} (template ${t.id})`)
    return { ok: true, message: `Installed “${doc.name}” (switched off).`, link: `/dashboard/admin/workflows?workflow=${doc.id}`, data: { workflow_id: doc.id } }
  },
})

export const setWorkflowEnabledTool = writeTool<{ workflow_id: string; enabled: boolean }>({
  name: 'set_workflow_enabled',
  risk: 'publish',
  description: 'Switch a workflow on or off. Switching on checks the workflow is complete (valid steps, schedule, webhook secret).',
  parameters: { type: 'object', properties: { workflow_id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['workflow_id', 'enabled'] },
  parse(raw) {
    const r = argsObject(raw, ['workflow_id', 'enabled'])
    const enabled = optBool(r, 'enabled')
    if (enabled === undefined) throw new ToolInputError('`enabled` is required (true or false).')
    return { workflow_id: reqId(r, 'workflow_id'), enabled }
  },
  async propose(a, ctx) {
    const wf = await loadWorkflowFor(ctx.caller, a.workflow_id)
    const g = workflowGateFor(ctx.caller)
    if (a.enabled) {
      const { prepareWorkflowUpdate } = await import('@/lib/automation/access')
      const { errors } = prepareWorkflowUpdate(wf, { is_active: true }, { platform: g.platform && !wf.tenant_id })
      if (errors.length) throw new ToolInputError(`It can't be switched on yet: ${errors.slice(0, 3).join('; ')}.`)
      if (wf.trigger === 'webhook' && !wf.webhook_secret_enc) throw new ToolInputError('Create the webhook signing secret before switching this workflow on.')
    }
    return { title: `${a.enabled ? 'Switch on' : 'Switch off'} workflow “${clip(wf.name, 80)}”`, preview: { workflow: wf.name, trigger: wf.trigger, schedule: wf.cron_expression ?? null, event: wf.event_type ?? null, active: { from: !!wf.is_active, to: a.enabled } } }
  },
  async execute(a, ctx) {
    const wf = await loadWorkflowFor(ctx.caller, a.workflow_id)
    const g = workflowGateFor(ctx.caller)
    const [{ prepareWorkflowUpdate }, { col }] = await Promise.all([import('@/lib/automation/access'), import('@/lib/automation/store')])
    const { set, errors } = prepareWorkflowUpdate(wf, { is_active: a.enabled }, { platform: g.platform && !wf.tenant_id })
    if (a.enabled && errors.length) return { ok: false, message: errors[0] }
    await (await col('workflows')).updateOne({ id: wf.id }, { $set: { ...set, updated_at: new Date().toISOString(), updated_by: ctx.caller.userId } })
    await adminAudit(ctx.caller.userId, a.enabled ? 'workflow.enable' : 'workflow.disable', 'workflow', wf.id, wf.name)
    return { ok: true, message: `“${wf.name}” is now ${a.enabled ? 'on' : 'off'}.`, link: `/dashboard/admin/workflows?workflow=${wf.id}` }
  },
})

export const rerunWorkflowRunTool = writeTool<{ workflow_id: string; run_id: string }>({
  name: 'rerun_workflow_run',
  risk: 'send',
  description: 'Re-run a failed workflow run from the step that failed (its side effects — emails, messages — may run again for that step).',
  parameters: { type: 'object', properties: { workflow_id: { type: 'string' }, run_id: { type: 'string' } }, required: ['workflow_id', 'run_id'] },
  parse(raw) {
    const r = argsObject(raw, ['workflow_id', 'run_id'])
    return { workflow_id: reqId(r, 'workflow_id'), run_id: reqId(r, 'run_id') }
  },
  async propose(a, ctx) {
    const wf = await loadWorkflowFor(ctx.caller, a.workflow_id)
    const { col } = await import('@/lib/automation/store')
    const run = (await (await col('workflow_runs')).findOne({ id: a.run_id, workflow_id: wf.id }, { projection: { _id: 0, id: 1, status: 1, started_at: 1, steps: 1, dry_run: 1 } })) as Doc | null
    if (!run) throw new ToolInputError('Run not found. Use list_workflow_runs.')
    if (run.dry_run) throw new ToolInputError('That was a test run — start a new test run instead.')
    if (run.status !== 'failed' && run.status !== 'partial') throw new ToolInputError('Only failed runs can be re-run.')
    const failed = (run.steps || []).filter((s: Doc) => s.status === 'failed')
    return { title: `Re-run “${clip(wf.name, 60)}” from the failed step`, preview: { workflow: wf.name, run: run.id, started_at: run.started_at, failed_steps: failed.map((s: Doc) => ({ step: s.label || s.id, error: clip(s.error, 160) })) } }
  },
  async execute(a, ctx) {
    const wf = await loadWorkflowFor(ctx.caller, a.workflow_id)
    const { col } = await import('@/lib/automation/store')
    const run = await (await col('workflow_runs')).findOne({ id: a.run_id, workflow_id: wf.id }, { projection: { _id: 0, id: 1 } })
    if (!run) return { ok: false, message: 'Run not found.' }
    const { rerunFromFailed } = await import('@/lib/automation/runs')
    const out = await rerunFromFailed(a.run_id, ctx.caller.userId)
    if (!out) return { ok: false, message: 'Only failed runs can be re-run.' }
    await adminAudit(ctx.caller.userId, 'workflow.rerun', 'workflow', wf.id, `run ${a.run_id}`)
    return { ok: true, message: `Re-run started (status: ${out.status}).`, link: `/dashboard/admin/workflows?workflow=${wf.id}` }
  },
})

export interface ScheduleTaskArgs {
  title: string
  instructions: string
  sources: ReportSource[]
  frequency: ScheduleFrequency
  time_utc: string
  weekday?: Weekday
  day_of_month?: number
  deliver: 'email' | 'in_app'
}

const SOURCE_KEYS = Object.keys(REPORT_SOURCES) as ReportSource[]

export const scheduleAgentTaskTool = writeTool<ScheduleTaskArgs>({
  name: 'schedule_agent_task',
  risk: 'create',
  description: `Schedule a recurring copilot report ("every Monday at 9:00 send me new applicants"). Creates an automation workflow that looks up the data, writes a short AI summary and emails it to you (or notifies you in the app). Data sources: ${SOURCE_KEYS.join(', ')}. Times are UTC — convert from the admin's time zone and say which UTC time you used.`,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 120 },
      instructions: { type: 'string', maxLength: 1000, description: 'What the summary should say / focus on.' },
      sources: { type: 'array', items: { type: 'string', enum: SOURCE_KEYS }, maxItems: 4 },
      frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
      time_utc: { type: 'string', description: 'HH:MM, 24-hour, UTC.' },
      weekday: { type: 'string', enum: [...WEEKDAYS] },
      day_of_month: { type: 'integer', minimum: 1, maximum: 28 },
      deliver: { type: 'string', enum: ['email', 'in_app'] },
    },
    required: ['title', 'instructions', 'sources', 'frequency', 'time_utc'],
  },
  parse(raw) {
    const r = argsObject(raw, ['title', 'instructions', 'sources', 'frequency', 'time_utc', 'weekday', 'day_of_month', 'deliver'])
    const sources = (optStringArray(r, 'sources', { maxItems: 4, maxLen: 40 }) ?? []) as string[]
    const bad = sources.filter((s) => !SOURCE_KEYS.includes(s as ReportSource))
    if (bad.length || !sources.length) throw new ToolInputError(`\`sources\` must be 1–4 of: ${SOURCE_KEYS.join(', ')}.`)
    const frequency = optEnum(r, 'frequency', ['daily', 'weekly', 'monthly'] as const)
    if (!frequency) throw new ToolInputError('`frequency` is required.')
    const time = reqString(r, 'time_utc', { max: 5 })
    if (!parseTime(time)) throw new ToolInputError('`time_utc` must be HH:MM (24-hour, UTC).')
    const weekday = optEnum(r, 'weekday', WEEKDAYS)
    const dom = optInt(r, 'day_of_month', 1, 28)
    return {
      title: reqString(r, 'title', { max: 120, min: 3 }),
      instructions: reqString(r, 'instructions', { max: 1000, min: 3 }),
      sources: sources as ReportSource[],
      frequency,
      time_utc: time,
      ...(weekday ? { weekday } : {}),
      ...(dom ? { day_of_month: dom } : {}),
      deliver: optEnum(r, 'deliver', ['email', 'in_app'] as const) ?? 'email',
    }
  },
  async propose(a, ctx) {
    if (a.deliver === 'email' && !ctx.caller.email) throw new ToolInputError('Your account has no email address — use deliver: "in_app".')
    const wf = buildScheduledWorkflow({ title: a.title, instructions: a.instructions, sources: a.sources, frequency: a.frequency, timeUtc: a.time_utc, weekday: a.weekday, dayOfMonth: a.day_of_month, deliver: a.deliver, recipient: { userId: ctx.caller.userId, email: ctx.caller.email || '' } })
    const { validateDefinition } = await import('@/lib/automation/steps-catalog')
    const errors = validateDefinition({ trigger: wf.trigger, cron_expression: wf.cron_expression, steps: wf.steps }, { platform: workflowGateFor(ctx.caller).platform })
    if (errors.length) throw new ToolInputError(`This schedule can't be built: ${errors.slice(0, 3).join('; ')}.`)
    return {
      title: `Schedule “${clip(a.title, 80)}” (${wf.description.split(':')[1]?.split('.')[0]?.trim() || a.frequency})`,
      preview: { title: a.title, when: wf.description.replace(/^Scheduled by the AI copilot: /, '').split('.')[0], cron_utc: wf.cron_expression, data: a.sources.map((s) => REPORT_SOURCES[s].label), deliver_to: a.deliver === 'email' ? ctx.caller.email : 'In-app notification', instructions: a.instructions, steps: wf.steps.map((s) => s.label || s.type), note: 'Runs as an automation workflow; switch it off any time in Workflows.' },
    }
  },
  async execute(a, ctx) {
    const g = workflowGateFor(ctx.caller)
    const wf = buildScheduledWorkflow({ title: a.title, instructions: a.instructions, sources: a.sources, frequency: a.frequency, timeUtc: a.time_utc, weekday: a.weekday, dayOfMonth: a.day_of_month, deliver: a.deliver, recipient: { userId: ctx.caller.userId, email: ctx.caller.email || '' } })
    const [{ validateDefinition }, { col }, { MAX_TENANT_WORKFLOWS }, { newId, nowIso }] = await Promise.all([
      import('@/lib/automation/steps-catalog'), import('@/lib/automation/store'), import('@/lib/automation/quotas'), import('@/lib/db/leaderboard'),
    ])
    const errors = validateDefinition({ trigger: wf.trigger, cron_expression: wf.cron_expression, steps: wf.steps }, { platform: g.platform })
    if (errors.length) return { ok: false, message: errors[0] }
    const c = await col('workflows')
    if (g.tenantId && (await c.countDocuments({ tenant_id: g.tenantId })) >= MAX_TENANT_WORKFLOWS) return { ok: false, message: `Your organisation can keep up to ${MAX_TENANT_WORKFLOWS} workflows. Delete one first.` }
    const ts = nowIso()
    // The admin explicitly confirmed this schedule, so it is created switched ON.
    const doc = {
      id: newId(), name: a.title, description: wf.description, trigger: wf.trigger, cron_expression: wf.cron_expression,
      event_type: null, event_filter: null, steps: wf.steps, version: 2 as const, sample_payload: {}, template_id: 'copilot-scheduled-task',
      nodes: [], edges: [], is_active: true, tenant_id: g.tenantId, created_by: ctx.caller.userId, created_at: ts, updated_at: ts,
    }
    await c.insertOne(doc)
    await adminAudit(ctx.caller.userId, 'workflow.create', 'workflow', doc.id, `${doc.name} (scheduled copilot task, ${wf.cron_expression})`)
    return { ok: true, message: `Scheduled “${a.title}” (${wf.cron_expression} UTC).`, link: `/dashboard/admin/workflows?workflow=${doc.id}`, data: { workflow_id: doc.id } }
  },
})

// ─── Codeathons + problems (AGT-013) ─────────────────────────────────────────

async function loadCodeathonDoc(caller: Parameters<typeof assertCanManage>[0], id: string): Promise<Doc> {
  const { codeathons } = await import('@/lib/db/content')
  const c = (await (await codeathons()).findOne({ id }, { projection: { _id: 0 } })) as Doc | null
  assertCanManage(caller, c, 'Codeathon')
  return c as Doc
}

const RELEASE_LOCKED = ['problems', 'startDate', 'endDate', 'event_type', 'status'] as const

export interface UpdateCodeathonArgs { codeathon_id: string; title?: string; description?: string; starts_at?: string; ends_at?: string; max_participants?: number; prize_pool?: string; rules?: string; topics?: string[]; difficulty?: 'easy' | 'medium' | 'hard'; problem_visibility?: 'after_start' | 'always' }

export const updateCodeathonTool = writeTool<UpdateCodeathonArgs>({
  name: 'update_codeathon',
  risk: 'update',
  description: 'Change a codeathon\'s details: title, description, dates, capacity, prize, rules, topics, difficulty, when problems become visible. Locked once results are released.',
  parameters: {
    type: 'object',
    properties: {
      codeathon_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, starts_at: { type: 'string' }, ends_at: { type: 'string' },
      max_participants: { type: 'integer', minimum: 1, maximum: 100000 }, prize_pool: { type: 'string' }, rules: { type: 'string' },
      topics: { type: 'array', items: { type: 'string' } }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }, problem_visibility: { type: 'string', enum: ['after_start', 'always'] },
    },
    required: ['codeathon_id'],
  },
  parse(raw) {
    const r = argsObject(raw, ['codeathon_id', 'title', 'description', 'starts_at', 'ends_at', 'max_participants', 'prize_pool', 'rules', 'topics', 'difficulty', 'problem_visibility'])
    const a: UpdateCodeathonArgs = { codeathon_id: reqId(r, 'codeathon_id') }
    const set = <K extends keyof UpdateCodeathonArgs>(k: K, v: UpdateCodeathonArgs[K] | undefined) => { if (v !== undefined) a[k] = v }
    set('title', optString(r, 'title', { max: 160, min: 3 }))
    set('description', optString(r, 'description', { max: 20000 }))
    set('starts_at', optDate(r, 'starts_at'))
    set('ends_at', optDate(r, 'ends_at'))
    set('max_participants', optInt(r, 'max_participants', 1, 100000))
    set('prize_pool', optString(r, 'prize_pool', { max: 200 }))
    set('rules', optString(r, 'rules', { max: 10000 }))
    set('topics', optStringArray(r, 'topics', { maxItems: 15, maxLen: 40 }))
    set('difficulty', optEnum(r, 'difficulty', ['easy', 'medium', 'hard'] as const))
    set('problem_visibility', optEnum(r, 'problem_visibility', ['after_start', 'always'] as const))
    if (Object.keys(a).length === 1) throw new ToolInputError('Say what to change.')
    if (a.starts_at && a.ends_at && a.ends_at <= a.starts_at) throw new ToolInputError('`ends_at` must be after `starts_at`.')
    return a
  },
  async propose(a, ctx) {
    const c = await loadCodeathonDoc(ctx.caller, a.codeathon_id)
    const patch = codeathonPatch(a)
    if (c.results_released === true && Object.keys(patch).some((k) => (RELEASE_LOCKED as readonly string[]).includes(k))) throw new ToolInputError('Results are released, so dates, format, status and problems are locked.')
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const [k, v] of Object.entries(patch)) if (JSON.stringify(c[k] ?? null) !== JSON.stringify(v)) changes[k] = { from: typeof c[k] === 'string' ? clip(c[k], 160) : c[k] ?? null, to: typeof v === 'string' ? clip(v, 160) : v }
    if (!Object.keys(changes).length) throw new ToolInputError('Nothing would change.')
    return { title: `Update codeathon “${clip(c.title, 80)}”`, preview: { codeathon: c.title, changes } }
  },
  async execute(a, ctx) {
    const c = await loadCodeathonDoc(ctx.caller, a.codeathon_id)
    const patch = codeathonPatch(a)
    if (c.results_released === true && Object.keys(patch).some((k) => (RELEASE_LOCKED as readonly string[]).includes(k))) return { ok: false, message: 'Results are released, so dates, format, status and problems are locked.' }
    const [{ codeathons, nowIso }, { knowledgeOnEventChange }] = await Promise.all([import('@/lib/db/content'), import('@/lib/rag/hooks')])
    await (await codeathons()).updateOne({ id: c.id }, { $set: { ...patch, updated_at: nowIso() } })
    knowledgeOnEventChange('codeathon', c.id, c.tenant_id)
    await adminAudit(ctx.caller.userId, 'codeathon.update', 'codeathon', c.id, Object.keys(patch).join(', '))
    return { ok: true, message: `Updated “${c.title}”.`, link: '/dashboard/admin/codeathons' }
  },
})

function codeathonPatch(a: UpdateCodeathonArgs): Doc {
  const p: Doc = {}
  if (a.title) p.title = a.title
  if (a.description !== undefined) p.description = a.description
  if (a.starts_at) p.startDate = a.starts_at
  if (a.ends_at) p.endDate = a.ends_at
  if (a.max_participants) p.maxParticipants = a.max_participants
  if (a.prize_pool !== undefined) p.prizePool = a.prize_pool
  if (a.rules !== undefined) p.rules = a.rules
  if (a.topics) p.topics = a.topics
  if (a.difficulty) p.difficulty = a.difficulty
  if (a.problem_visibility) p.problem_visibility = a.problem_visibility
  return p
}

export const publishCodeathonTool = writeTool<{ codeathon_id: string; status: 'upcoming' | 'live' | 'completed' }>({
  name: 'publish_codeathon',
  risk: 'publish',
  description: 'Set a codeathon\'s status: upcoming (listed, registration open), live (running now) or completed.',
  parameters: { type: 'object', properties: { codeathon_id: { type: 'string' }, status: { type: 'string', enum: ['upcoming', 'live', 'completed'] } }, required: ['codeathon_id', 'status'] },
  parse(raw) {
    const r = argsObject(raw, ['codeathon_id', 'status'])
    const status = optEnum(r, 'status', ['upcoming', 'live', 'completed'] as const)
    if (!status) throw new ToolInputError('`status` is required.')
    return { codeathon_id: reqId(r, 'codeathon_id'), status }
  },
  async propose(a, ctx) {
    const c = await loadCodeathonDoc(ctx.caller, a.codeathon_id)
    if (c.results_released === true) throw new ToolInputError('Results are released; the status is locked.')
    if (c.status === a.status) throw new ToolInputError(`It is already ${a.status}.`)
    const warnings: string[] = []
    if (a.status !== 'completed' && !(Array.isArray(c.problems) && c.problems.length)) warnings.push('It has no problems yet.')
    return { title: `Set codeathon “${clip(c.title, 80)}” to ${a.status}`, preview: { codeathon: c.title, status: { from: c.status ?? 'upcoming', to: a.status }, starts: c.startDate ?? null, ends: c.endDate ?? null, problems: Array.isArray(c.problems) ? c.problems.length : 0, warnings } }
  },
  async execute(a, ctx) {
    const c = await loadCodeathonDoc(ctx.caller, a.codeathon_id)
    if (c.results_released === true) return { ok: false, message: 'Results are released; the status is locked.' }
    const [{ codeathons, nowIso }, { knowledgeOnEventChange }] = await Promise.all([import('@/lib/db/content'), import('@/lib/rag/hooks')])
    await (await codeathons()).updateOne({ id: c.id }, { $set: { status: a.status, updated_at: nowIso() } })
    knowledgeOnEventChange('codeathon', c.id, c.tenant_id)
    await adminAudit(ctx.caller.userId, 'codeathon.status', 'codeathon', c.id, `${c.status ?? 'upcoming'} → ${a.status}`)
    return { ok: true, message: `“${c.title}” is now ${a.status}.`, link: '/dashboard/admin/codeathons' }
  },
})

async function loadProblemDoc(caller: Parameters<typeof serviceUser>[0], ref: string): Promise<Doc> {
  const [{ problems }, { canEditProblemAsAdmin }] = await Promise.all([import('@/lib/db/problems'), import('@/lib/hackathons/tenant-scope')])
  const p = (await (await problems()).findOne({ $or: [{ slug: ref }, { id: ref }] }, { projection: { _id: 0 } })) as Doc | null
  if (!p) throw new ToolInputError('Problem not found. Use search_problems.')
  const user = serviceUser(caller)
  // Same rule as PATCH /api/problems/[slug]; a scoped superadmin stays inside the picked organisation.
  const scopedOk = caller.role !== 'superadmin' || !caller.tenantId || !p.tenant_id || p.tenant_id === caller.tenantId
  if (!canEditProblemAsAdmin({ id: user.id, role: user.role, tenantId: user.tenantId ?? null } as never, p as never) || !scopedOk) {
    throw new ToolPermissionError('You can only edit problems your organisation owns.')
  }
  return p
}

export interface UpdateProblemArgs { problem: string; title?: string; difficulty?: 'easy' | 'medium' | 'hard'; topics?: string[]; statement_md?: string; input_format?: string; output_format?: string; constraints?: string; time_limit_ms?: number }

export const updateProblemTool = writeTool<UpdateProblemArgs>({
  name: 'update_problem',
  risk: 'update',
  description: 'Edit a coding problem your organisation owns: title, difficulty, topics, statement, input/output format, constraints, time limit. Test cases are not changed here.',
  parameters: {
    type: 'object',
    properties: {
      problem: { type: 'string', description: 'Slug or id.' }, title: { type: 'string' }, difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] }, topics: { type: 'array', items: { type: 'string' } },
      statement_md: { type: 'string' }, input_format: { type: 'string' }, output_format: { type: 'string' }, constraints: { type: 'string' }, time_limit_ms: { type: 'integer', minimum: 500, maximum: 20000 },
    },
    required: ['problem'],
  },
  parse(raw) {
    const r = argsObject(raw, ['problem', 'title', 'difficulty', 'topics', 'statement_md', 'input_format', 'output_format', 'constraints', 'time_limit_ms'])
    const a: UpdateProblemArgs = { problem: reqString(r, 'problem', { max: 160 }) }
    const set = <K extends keyof UpdateProblemArgs>(k: K, v: UpdateProblemArgs[K] | undefined) => { if (v !== undefined) a[k] = v }
    set('title', optString(r, 'title', { max: 160, min: 3 }))
    set('difficulty', optEnum(r, 'difficulty', ['easy', 'medium', 'hard'] as const))
    set('topics', optStringArray(r, 'topics', { maxItems: 15, maxLen: 40 }))
    set('statement_md', optString(r, 'statement_md', { max: 30000 }))
    set('input_format', optString(r, 'input_format', { max: 5000 }))
    set('output_format', optString(r, 'output_format', { max: 5000 }))
    set('constraints', optString(r, 'constraints', { max: 5000 }))
    set('time_limit_ms', optInt(r, 'time_limit_ms', 500, 20000))
    if (Object.keys(a).length === 1) throw new ToolInputError('Say what to change.')
    return a
  },
  async propose(a, ctx) {
    const p = await loadProblemDoc(ctx.caller, a.problem)
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const [k, v] of Object.entries(a)) {
      if (k === 'problem' || k.startsWith('_') || v === undefined) continue
      if (JSON.stringify(p[k] ?? null) !== JSON.stringify(v)) changes[k] = { from: typeof p[k] === 'string' ? clip(p[k], 200) : p[k] ?? null, to: typeof v === 'string' ? clip(v, 200) : v }
    }
    if (!Object.keys(changes).length) throw new ToolInputError('Nothing would change.')
    return { title: `Update problem “${clip(p.title, 80)}”`, preview: { problem: p.title, slug: p.slug, changes } }
  },
  async execute(a, ctx) {
    const p = await loadProblemDoc(ctx.caller, a.problem)
    const patch: Doc = {}
    for (const [k, v] of Object.entries(a)) if (k !== 'problem' && !k.startsWith('_') && v !== undefined) patch[k] = v
    const [{ problems }, { knowledgeOnLibraryChange }] = await Promise.all([import('@/lib/db/problems'), import('@/lib/rag/hooks')])
    await (await problems()).updateOne({ id: p.id }, { $set: { ...patch, updated_at: new Date().toISOString() } })
    knowledgeOnLibraryChange('problem', String(p.id))
    await adminAudit(ctx.caller.userId, 'problem.update', 'problem', String(p.id), Object.keys(patch).join(', '))
    return { ok: true, message: `Updated “${p.title}”.`, link: `/dashboard/problems/${p.slug}` }
  },
})

export const publishProblemTool = writeTool<{ problem: string; published: boolean }>({
  name: 'publish_problem',
  risk: 'publish',
  description: 'Publish (or unpublish) a coding problem your organisation owns. A problem needs test cases before it can be published.',
  parameters: { type: 'object', properties: { problem: { type: 'string', description: 'Slug or id.' }, published: { type: 'boolean' } }, required: ['problem', 'published'] },
  parse(raw) {
    const r = argsObject(raw, ['problem', 'published'])
    const published = optBool(r, 'published')
    if (published === undefined) throw new ToolInputError('`published` is required.')
    return { problem: reqString(r, 'problem', { max: 160 }), published }
  },
  async propose(a, ctx) {
    const p = await loadProblemDoc(ctx.caller, a.problem)
    const tests = Array.isArray(p.test_cases) ? p.test_cases.length : 0
    if (a.published && !tests) throw new ToolInputError('This problem has no test cases yet.')
    if (!!p.is_published === a.published) throw new ToolInputError(`It is already ${a.published ? 'published' : 'unpublished'}.`)
    const warnings = a.published && p.tests_verified === false ? ['Its AI-generated hidden tests were not verified against a reference solution — review them first.'] : []
    return { title: `${a.published ? 'Publish' : 'Unpublish'} problem “${clip(p.title, 80)}”`, preview: { problem: p.title, difficulty: p.difficulty, tests, visibility: p.visibility ?? 'public', warnings } }
  },
  async execute(a, ctx) {
    const p = await loadProblemDoc(ctx.caller, a.problem)
    const [{ problems }, { knowledgeOnLibraryChange }] = await Promise.all([import('@/lib/db/problems'), import('@/lib/rag/hooks')])
    await (await problems()).updateOne({ id: p.id }, { $set: { is_published: a.published, updated_at: new Date().toISOString() } })
    knowledgeOnLibraryChange('problem', String(p.id))
    await adminAudit(ctx.caller.userId, a.published ? 'problem.publish' : 'problem.unpublish', 'problem', String(p.id), p.title)
    return { ok: true, message: `“${p.title}” is now ${a.published ? 'published' : 'unpublished'}.`, link: `/dashboard/problems/${p.slug}` }
  },
})

// ─── Question bank (superadmin) ──────────────────────────────────────────────

const BANK_FIELDS = ['title', 'question', 'type', 'options', 'answer', 'explanation', 'difficulty', 'marks', 'branch', 'subject', 'tags', 'tech_stack', 'degree_type', 'industry'] as const

/** AGT-013: add questions to the shared bank as drafts (reviewed before exams can sample them). */
export const addQuestionsToBankTool = writeTool<{ questions: Doc[] }>({
  name: 'add_questions_to_bank',
  risk: 'create',
  roles: [...SUPER],
  description: 'Add up to 25 questions to the platform question bank. They are saved as drafts and must be reviewed before exams can use them. Duplicates of existing bank questions are skipped.',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array', maxItems: 25,
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' }, title: { type: 'string' }, type: { type: 'string', description: 'mcq, msq, short, coding, …' },
            options: { type: 'array', items: { type: 'string' } }, answer: { type: 'string' }, explanation: { type: 'string' },
            difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] }, marks: { type: 'number' },
            branch: { type: 'string' }, subject: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['question'],
        },
      },
    },
    required: ['questions'],
  },
  parse(raw) {
    const r = argsObject(raw, ['questions'])
    const list = Array.isArray(r.questions) ? r.questions : []
    if (!list.length) throw new ToolInputError('Give at least one question.')
    if (list.length > 25) throw new ToolInputError('At most 25 questions per draft.')
    const questions = list.map((q, i) => {
      if (!q || typeof q !== 'object') throw new ToolInputError(`Question ${i + 1} is not an object.`)
      const picked: Doc = {}
      for (const k of BANK_FIELDS) if ((q as Doc)[k] !== undefined) picked[k] = (q as Doc)[k]
      return picked
    })
    return { questions }
  },
  async propose(a) {
    const [{ normalizeBankQuestion, questionBank, bankContentHash, existingBankKeys }] = await Promise.all([import('@/lib/question-bank')])
    const docs = a.questions.map((q) => normalizeBankQuestion(q))
    const bad = docs.findIndex((d) => !d)
    if (bad >= 0) throw new ToolInputError(`Question ${bad + 1} has no prompt.`)
    const seen = (await existingBankKeys(await questionBank(), docs.map((d) => bankContentHash(d!)), [])).hashes
    const dupes = docs.filter((d) => seen.has(bankContentHash(d!))).length
    return {
      title: `Add ${docs.length - dupes} question${docs.length - dupes === 1 ? '' : 's'} to the bank (as drafts)`,
      preview: {
        questions: docs.map((d) => ({ title: clip(d!.title, 80), type: d!.type, difficulty: d!.difficulty, options: d!.options?.length ?? 0, has_answer: !!d!.answer })),
        ...(dupes ? { warnings: [`${dupes} already in the bank — they will be skipped.`] } : {}),
      },
    }
  },
  async execute(a, ctx) {
    const [{ normalizeBankQuestion, questionBank, bankContentHash, existingBankKeys, withBankKeys }, { knowledgeOnLibraryChange }] = await Promise.all([import('@/lib/question-bank'), import('@/lib/rag/hooks')])
    const col = await questionBank()
    const docs = a.questions.map((q) => normalizeBankQuestion(q)).filter((d): d is NonNullable<typeof d> => !!d)
    const seen = (await existingBankKeys(col, docs.map((d) => bankContentHash(d)), [])).hashes
    const fresh = docs.filter((d) => !seen.has(bankContentHash(d)))
    for (const d of fresh) { d.source = 'manual'; d.review_status = 'draft' }
    if (fresh.length) await col.insertMany(fresh.map((d) => withBankKeys(d)) as never)
    for (const d of fresh) knowledgeOnLibraryChange('question', d.id)
    await adminAudit(ctx.caller.userId, 'question_bank.add', 'question_bank', fresh.map((d) => d.id).join(',').slice(0, 200), `${fresh.length} draft questions`)
    return { ok: true, message: `Added ${fresh.length} draft question${fresh.length === 1 ? '' : 's'} to the bank${docs.length - fresh.length ? ` (${docs.length - fresh.length} duplicates skipped)` : ''}. Review them before exams use them.`, link: '/dashboard/admin/question-bank' }
  },
})
