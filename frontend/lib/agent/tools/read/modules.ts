/**
 * Read tools for the newer modules: marketplace (superadmin), Learn hub
 * (superadmin), events feed, automations (workflows + runs + templates) and
 * copilot usage / platform KPIs. Each calls the same lib/* service the admin
 * UI uses and is scoped by the caller (tenant admins: own organisation only).
 */
import { readTool } from '../define'
import { argsObject, optEnum, optInt, optString, paging, reqId } from '../args'
import { clip } from '../output'

type Doc = Record<string, any>
const SUPER = ['superadmin'] as const

const money = (minor: unknown, currency: unknown) => (typeof minor === 'number' ? `${(minor / 100).toFixed(2)} ${String(currency || '')}`.trim() : null)

// ─── Marketplace (platform-wide → superadmin only) ───────────────────────────

export const listMarketplaceProductsTool = readTool({
  name: 'list_marketplace_products',
  roles: [...SUPER],
  description: 'Marketplace products by status (pending_review = waiting for moderation), optionally for one seller.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending_review', 'published', 'draft', 'rejected', 'any'] },
      seller_id: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'seller_id', 'limit'])
    return { status: optEnum(r, 'status', ['pending_review', 'published', 'draft', 'rejected', 'any'] as const) ?? 'pending_review', seller_id: r.seller_id ? reqId(r, 'seller_id') : undefined, limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { listProductsAdmin } = await import('@/lib/marketplace/moderation')
    const rows = (await listProductsAdmin({ status: a.status === 'any' ? null : a.status, sellerId: a.seller_id ?? null })) as Doc[]
    return {
      data: {
        total: rows.length,
        products: rows.slice(0, a.limit).map((p) => ({ id: p.id, title: clip(p.title, 100), kind: p.kind, status: p.status, seller_id: p.seller_id, price: money(p.price, p.currency), category: p.category, submitted_at: p.submitted_at ?? null, review_note: clip(p.review_note, 160) || null })),
      },
    }
  },
})

export const listMarketplaceOrdersTool = readTool({
  name: 'list_marketplace_orders',
  roles: [...SUPER],
  description: 'Recent marketplace orders (status, totals, lines) and open refund requests.',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Order status filter, e.g. paid, fulfilled, refunded.' },
      q: { type: 'string', description: 'Order number.' },
      refunds: { type: 'string', enum: ['open', 'approved', 'rejected', 'refunded', 'any', 'none'], description: 'Also list refund requests in this state (default open).' },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['status', 'q', 'refunds', 'limit'])
    return { status: optString(r, 'status', { max: 30 }), q: optString(r, 'q', { max: 120 }), refunds: optEnum(r, 'refunds', ['open', 'approved', 'rejected', 'refunded', 'any', 'none'] as const) ?? 'open', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { listOrdersAdmin, listRefundsAdmin } = await import('@/lib/marketplace/moderation')
    const [orders, refunds] = await Promise.all([
      listOrdersAdmin({ status: a.status ?? null, q: a.q ?? null, limit: a.limit }) as Promise<unknown> as Promise<Doc[]>,
      a.refunds === 'none' ? Promise.resolve([]) : (listRefundsAdmin(a.refunds === 'any' ? null : a.refunds) as Promise<unknown> as Promise<Doc[]>),
    ])
    return {
      data: {
        orders: orders.slice(0, a.limit).map((o: Doc) => ({ id: o.id, number: o.number ?? null, status: o.status, total: money(o.grand_total, o.currency), lines: Array.isArray(o.lines) ? o.lines.length : 0, created_at: o.created_at })),
        refund_requests: refunds.slice(0, 20).map((r) => ({ id: r.id, order_id: r.order_id, type: r.type, status: r.status, amount: money(r.amount, r.currency), reason: clip(r.reason, 160), created_at: r.created_at })),
      },
    }
  },
})

export const listMarketplaceSellersTool = readTool({
  name: 'list_marketplace_sellers',
  roles: [...SUPER],
  description: 'Marketplace sellers by status (pending = applications waiting for review). No bank or tax details.',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'suspended', 'any'] }, q: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['status', 'q', 'limit'])
    return { status: optEnum(r, 'status', ['pending', 'approved', 'rejected', 'suspended', 'any'] as const) ?? 'any', q: optString(r, 'q', { max: 100 }), limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a) {
    const { listSellersAdmin } = await import('@/lib/marketplace/moderation')
    const rows = (await listSellersAdmin({ status: a.status === 'any' ? null : a.status, q: a.q ?? null })) as unknown as Doc[]
    return { data: { total: rows.length, sellers: rows.slice(0, a.limit).map((s) => ({ id: s.id, name: s.display_name, status: s.status, country: s.country, created_at: s.created_at })) } }
  },
})

export const listMarketplacePayoutsTool = readTool({
  name: 'list_marketplace_payouts',
  roles: [...SUPER],
  description: 'Seller payout requests by status (requested = waiting for approval). Amounts and method only — never bank details.',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['requested', 'approved', 'paying', 'paid', 'failed', 'cancelled', 'any'] }, seller_id: { type: 'string' } } },
  parse(raw) {
    const r = argsObject(raw, ['status', 'seller_id'])
    return { status: optEnum(r, 'status', ['requested', 'approved', 'paying', 'paid', 'failed', 'cancelled', 'any'] as const) ?? 'requested', seller_id: r.seller_id ? reqId(r, 'seller_id') : undefined }
  },
  async run(a) {
    const { listPayouts } = await import('@/lib/marketplace/payouts')
    const rows = (await listPayouts({ ...(a.seller_id ? { sellerId: a.seller_id } : {}), status: a.status === 'any' ? null : a.status }, 50)) as unknown as Doc[]
    return { data: { total: rows.length, payouts: rows.map((p) => ({ id: p.id, seller_id: p.seller_id, status: p.status, amount: money(p.amount, p.currency), method: p.method, requested_at: p.requested_at })) } }
  },
})

export const getMarketplaceSalesTool = readTool({
  name: 'get_marketplace_sales',
  roles: [...SUPER],
  description: 'Marketplace sales report for a date range: revenue, orders, fees, top sellers and products.',
  parameters: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } } },
  parse(raw) {
    const r = argsObject(raw, ['from', 'to'])
    return { from: optString(r, 'from', { max: 10 }) ?? null, to: optString(r, 'to', { max: 10 }) ?? null }
  },
  async run(a) {
    const { buildReport, parseRange } = await import('@/lib/marketplace/reports')
    const range = parseRange(a.from, a.to)
    return { data: { ...(await buildReport(range)), range } }
  },
})

// ─── Learn hub (platform content → superadmin) ───────────────────────────────

export const listLearnTopicsTool = readTool({
  name: 'list_learn_topics',
  roles: [...SUPER],
  description: 'Learn hub topics the generator writes about, with how many posts each has.',
  parameters: { type: 'object', properties: { category: { type: 'string' }, q: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['category', 'q', 'limit'])
    return { category: optString(r, 'category', { max: 40 }), q: optString(r, 'q', { max: 100 }), limit: optInt(r, 'limit', 1, 50) ?? 25 }
  },
  async run(a) {
    const { learnTopics } = await import('@/lib/learn/store')
    const filter: Doc = {}
    if (a.category) filter.category = a.category
    if (a.q) filter.title = { $regex: a.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const rows = await (await learnTopics()).find(filter, { projection: { _id: 0, id: 1, title: 1, category: 1, level: 1, enabled: 1, generated_count: 1, series: 1 } }).sort({ priority: -1, title: 1 }).limit(a.limit).toArray()
    return { data: { topics: rows } }
  },
})

export const listLearnPostsTool = readTool({
  name: 'list_learn_posts',
  roles: [...SUPER],
  description: 'Learn hub posts by status (draft = waiting for review), with quality score and flags.',
  parameters: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'approved', 'scheduled', 'published', 'rejected', 'archived', 'any'] }, q: { type: 'string' }, page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['status', 'q', 'page', 'limit'])
    return { status: optEnum(r, 'status', ['draft', 'approved', 'scheduled', 'published', 'rejected', 'archived', 'any'] as const) ?? 'draft', q: optString(r, 'q', { max: 100 }), ...paging(r, 20, 50) }
  },
  async run(a) {
    const { learnPosts } = await import('@/lib/learn/store')
    const filter: Doc = {}
    if (a.status !== 'any') filter.status = a.status
    if (a.q) filter.title = { $regex: a.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    const col = await learnPosts()
    const [total, rows] = await Promise.all([
      col.countDocuments(filter),
      col.find(filter, { projection: { _id: 0, id: 1, slug: 1, title: 1, status: 1, category: 1, level: 1, quality: 1, created_at: 1, published_at: 1, summary: 1 } }).sort({ created_at: -1 }).skip((a.page - 1) * a.limit).limit(a.limit).toArray(),
    ])
    return { data: { total, page: a.page, posts: rows.map((p: Doc) => ({ id: p.id, title: clip(p.title, 120), status: p.status, category: p.category, level: p.level, score: p.quality?.score ?? null, flags: (p.quality?.flags ?? []).slice(0, 5), summary: clip(p.summary, 200), created_at: p.created_at, link: `/dashboard/admin/learn?post=${p.id}` })) } }
  },
})

// ─── Events feed ─────────────────────────────────────────────────────────────

export const searchFeedEventsTool = readTool({
  name: 'search_feed_events',
  description: 'Search the external events feed (hackathons, CTFs, contests from other organisers). Organisation admins see published events; platform admins can also filter hidden / archived ones.',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string' },
      status: { type: 'string', enum: ['published', 'hidden', 'archived', 'any'] },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['q', 'status', 'limit'])
    return { q: optString(r, 'q', { max: 120 }), status: optEnum(r, 'status', ['published', 'hidden', 'archived', 'any'] as const) ?? 'published', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a, ctx) {
    const { listAdminEvents } = await import('@/lib/events-feed/admin')
    // Only platform admins see what is not published.
    const status = ctx.caller.role === 'superadmin' ? (a.status === 'any' ? undefined : a.status) : 'published'
    const rows = (await listAdminEvents({ status, search: a.q, limit: a.limit })) as unknown as Doc[]
    return {
      data: {
        total: rows.length,
        events: rows.map((e) => ({ id: e.id, title: clip(e.title, 120), kind: e.kind, mode: e.mode, status: e.status, featured: !!e.featured, organiser: e.organiser, starts_at: e.starts_at, registration_deadline: e.registration_deadline, city: e.location?.city ?? null, link: `/events/${e.id}` })),
      },
    }
  },
})

export const getFeedStatsTool = readTool({
  name: 'get_feed_stats',
  roles: [...SUPER],
  description: 'Events feed numbers: events by status, featured, sources, and subscriber counts (email / WhatsApp).',
  parameters: { type: 'object', properties: {} },
  parse(raw) {
    argsObject(raw, [])
    return {}
  },
  async run() {
    const [{ feedCounts, listSourcesForAdmin }, { subscribersCol }] = await Promise.all([import('@/lib/events-feed/admin'), import('@/lib/subscriptions/store')])
    const subs = await subscribersCol()
    const [counts, sources, email, whatsapp, total] = await Promise.all([
      feedCounts(),
      listSourcesForAdmin() as Promise<unknown> as Promise<Doc[]>,
      subs.countDocuments({ email_status: 'active' } as never),
      subs.countDocuments({ whatsapp_status: 'active' } as never),
      subs.countDocuments({}),
    ])
    return { data: { events: counts, sources: (Array.isArray(sources) ? sources : []).slice(0, 20).map((s: Doc) => ({ id: s.id, enabled: s.enabled !== false, last_run_at: s.last_run_at ?? null })), subscribers: { total, email_active: email, whatsapp_active: whatsapp } } }
  },
})

// ─── Automations ─────────────────────────────────────────────────────────────

/** The automations access gate for this caller (same rules as /api/workflows). */
export function workflowGateFor(caller: { role: string; tenantId: string | null }): { platform: boolean; tenantId: string | null } {
  if (caller.role === 'superadmin' && !caller.tenantId) return { platform: true, tenantId: null }
  return { platform: false, tenantId: caller.tenantId }
}

export const listWorkflowsTool = readTool({
  name: 'list_workflows',
  description: 'Automations (workflows) for your organisation: trigger, schedule, on/off and the last run status.',
  parameters: { type: 'object', properties: { active: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['active', 'limit'])
    return { active: typeof r.active === 'boolean' ? r.active : undefined, limit: optInt(r, 'limit', 1, 50) ?? 30 }
  },
  async run(a, ctx) {
    const [{ workflowScope }, { col }] = await Promise.all([import('@/lib/automation/access'), import('@/lib/automation/store')])
    const filter: Doc = { ...workflowScope(workflowGateFor(ctx.caller)) }
    if (a.active !== undefined) filter.is_active = a.active
    const rows = await (await col('workflows')).find(filter, { projection: { _id: 0, webhook_secret_enc: 0, steps: 0, nodes: 0, edges: 0, sample_payload: 0 } }).sort({ updated_at: -1 }).limit(a.limit).toArray()
    return { data: { total: rows.length, workflows: rows.map((w: Doc) => ({ id: w.id, name: w.name, trigger: w.trigger, cron: w.cron_expression ?? null, event: w.event_type ?? null, active: !!w.is_active, last_run_at: w.last_run_at ?? null, last_run_status: w.last_run_status ?? null, link: `/dashboard/admin/workflows?workflow=${w.id}` })) } }
  },
})

export const listWorkflowRunsTool = readTool({
  name: 'list_workflow_runs',
  description: 'Recent runs of one workflow (or of all your workflows), with failed steps and errors — to find what broke.',
  parameters: { type: 'object', properties: { workflow_id: { type: 'string' }, status: { type: 'string', enum: ['failed', 'success', 'running', 'waiting', 'any'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } } },
  parse(raw) {
    const r = argsObject(raw, ['workflow_id', 'status', 'limit'])
    return { workflow_id: r.workflow_id ? reqId(r, 'workflow_id') : undefined, status: optEnum(r, 'status', ['failed', 'success', 'running', 'waiting', 'any'] as const) ?? 'any', limit: optInt(r, 'limit', 1, 50) ?? 20 }
  },
  async run(a, ctx) {
    const [{ workflowScope }, { col }] = await Promise.all([import('@/lib/automation/access'), import('@/lib/automation/store')])
    const wfs = await (await col('workflows')).find({ ...workflowScope(workflowGateFor(ctx.caller)), ...(a.workflow_id ? { id: a.workflow_id } : {}) }, { projection: { _id: 0, id: 1, name: 1 } }).limit(500).toArray()
    if (a.workflow_id && !wfs.length) return { data: { error: 'Workflow not found. Use list_workflows.' } }
    const names = new Map(wfs.map((w: Doc) => [String(w.id), String(w.name)]))
    const filter: Doc = { workflow_id: { $in: [...names.keys()] } }
    if (a.status !== 'any') filter.status = a.status
    const runs = await (await col('workflow_runs')).find(filter, { projection: { _id: 0, id: 1, workflow_id: 1, status: 1, started_at: 1, finished_at: 1, steps: 1, error: 1, dry_run: 1 } }).sort({ started_at: -1 }).limit(a.limit).toArray()
    return {
      data: {
        runs: runs.map((r: Doc) => {
          const failed = (Array.isArray(r.steps) ? r.steps : []).filter((s: Doc) => s.status === 'failed' || s.error)
          return { id: r.id, workflow: names.get(String(r.workflow_id)), workflow_id: r.workflow_id, status: r.status, started_at: r.started_at, finished_at: r.finished_at ?? null, test_run: !!r.dry_run, failed_steps: failed.slice(0, 3).map((s: Doc) => ({ step: s.label || s.id || s.node_id, error: clip(s.error, 200) })), error: clip(r.error, 200) || null }
        }),
      },
    }
  },
})

export const listWorkflowTemplatesTool = readTool({
  name: 'list_workflow_templates',
  description: 'Ready-made workflow templates you can install (switched off until you enable them).',
  parameters: { type: 'object', properties: { category: { type: 'string' } } },
  parse(raw) {
    const r = argsObject(raw, ['category'])
    return { category: optString(r, 'category', { max: 40 }) }
  },
  async run(a, ctx) {
    const tpl = await import('@/lib/automation/templates')
    const platform = workflowGateFor(ctx.caller).platform
    const avail = (tpl as Record<string, unknown>).templateAvailableTo as ((t: unknown, p: boolean) => boolean) | undefined
    const items = tpl.WORKFLOW_TEMPLATES.filter((t) => (avail ? avail(t, platform) : platform || !t.platformOnly) && (!a.category || t.category.toLowerCase() === a.category.toLowerCase()))
    return { data: { templates: items.map((t) => ({ id: t.id, name: t.name, category: t.category, trigger: t.trigger, event: t.event_type ?? null, cron: t.cron_expression ?? null, description: clip(t.description, 220), setup: t.setup ?? null })) } }
  },
})

// ─── Usage + KPIs ────────────────────────────────────────────────────────────

export const getCopilotUsageTool = readTool({
  name: 'get_copilot_usage',
  description: 'AI copilot usage for your organisation: tokens, cost, credits and messages per day, and the remaining daily / monthly budget.',
  parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 90 } } },
  parse(raw) {
    const r = argsObject(raw, ['days'])
    return { days: optInt(r, 'days', 1, 90) ?? 30 }
  },
  async run(a, ctx) {
    const [{ agentUsageReport, checkBudget }, { budgetKey }] = await Promise.all([import('@/lib/agent/usage'), import('@/lib/agent/budget')])
    const key = budgetKey(ctx.caller)
    const [report, budget] = await Promise.all([agentUsageReport({ tenantKey: key, days: a.days }), checkBudget(ctx.caller)])
    return { data: { totals: report.totals, daily: report.daily.slice(-14), by_status: report.by_status, budget: { daily: budget.daily, monthly: budget.monthly } } }
  },
})

export const getPlatformKpisTool = readTool({
  name: 'get_platform_kpis',
  description: 'Headline KPIs from the analytics dashboards for a period (with the previous period and % change), plus conversion funnels (acquisition, candidate, hiring, marketplace). Organisation admins get their own organisation\'s numbers.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'YYYY-MM-DD' },
      to: { type: 'string', description: 'YYYY-MM-DD' },
      preset: { type: 'string', enum: ['7d', '30d', '90d'] },
      funnels: { type: 'boolean', description: 'Include the conversion funnels.' },
    },
  },
  parse(raw) {
    const r = argsObject(raw, ['from', 'to', 'preset', 'funnels'])
    return { from: optString(r, 'from', { max: 10 }) ?? null, to: optString(r, 'to', { max: 10 }) ?? null, preset: optEnum(r, 'preset', ['7d', '30d', '90d'] as const) ?? '30d', funnels: r.funnels === true }
  },
  async run(a, ctx) {
    // Public functions of the analytics part (lib/analytics/query.ts); scope from the session caller only.
    const [{ getKpis, getFunnels }, { parseRange }] = await Promise.all([import('@/lib/analytics/query'), import('@/lib/analytics/range')])
    const scope = ctx.caller.role === 'superadmin' && !ctx.caller.tenantId
      ? ({ kind: 'platform' } as const)
      : ({ kind: 'tenant', tenantId: String(ctx.caller.tenantId) } as const)
    const range = parseRange({ from: a.from, to: a.to, preset: a.preset })
    const [kpis, funnels] = await Promise.all([getKpis(range, scope), a.funnels ? getFunnels(range, scope) : Promise.resolve(null)])
    return { data: { period: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10), days: range.days }, scope: scope.kind, kpis, ...(funnels ? { funnels } : {}) } }
  },
})
