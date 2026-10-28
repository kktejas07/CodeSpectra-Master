/**
 * Analytics read API (server only). Small public surface for dashboards and,
 * later, the copilot:
 *
 *   getKpis(range, scope)          headline numbers (+ previous period, % change)
 *   getFunnel(name, range, scope)  step counts with step / overall conversion
 *
 * plus the dashboard sections (traffic, content, usage, retention, revenue,
 * AI usage, web vitals, assessments, seller sales).
 *
 * Scope is decided by the caller from the signed-in user — never from request
 * input: 'platform' (superadmin), 'tenant' (an organisation's own data only),
 * 'seller' (a marketplace seller's own products and orders). Every tenant /
 * seller query filters on that id; tenant / seller paths only use find /
 * distinct / count so the isolation is unit tested against the fake DB.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { computeFunnel, cohortRetention, FUNNELS, type FunnelName, type FunnelResult, type CohortRow } from './funnels'
import { delta, dayKeys, inRange, previousRange, type DateRange } from './range'
import { mergeRollups, rows as counterRows, type DailyRollup, type MergedRollup } from './rollup'

export type AnalyticsScope =
  | { kind: 'platform' }
  | { kind: 'tenant'; tenantId: string }
  | { kind: 'seller'; sellerId: string }

type Doc = Record<string, any>
type Db = Awaited<ReturnType<typeof getMongoDb>>

export class ScopeError extends Error {}

/** Throws on a tenant / seller scope without an id (never fall through to "everything"). */
export function assertScope(scope: AnalyticsScope): void {
  if (scope.kind === 'tenant' && !(typeof scope.tenantId === 'string' && scope.tenantId)) throw new ScopeError('tenant scope needs a tenant id')
  if (scope.kind === 'seller' && !(typeof scope.sellerId === 'string' && scope.sellerId)) throw new ScopeError('seller scope needs a seller id')
}

const tenantOnly = (scope: AnalyticsScope): Doc => (scope.kind === 'tenant' ? { tenant_id: scope.tenantId } : {})
const and = (...parts: Doc[]): Doc => {
  const f = parts.filter((p) => Object.keys(p).length)
  return f.length === 0 ? {} : f.length === 1 ? f[0] : { $and: f }
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
const SOLD = ['paid', 'partially_fulfilled', 'fulfilled', 'partially_refunded', 'refunded']
const MAX_IDS = 50_000

export interface Kpi {
  key: string
  label: string
  value: number | null
  unit?: 'count' | 'percent' | 'money' | 'days'
  currency?: string
  previous?: number | null
  change?: number | null
  hint?: string
}

// ─── Traffic (rollups) ──────────────────────────────────────────────────────

export async function getTraffic(range: DateRange): Promise<MergedRollup> {
  const { rollupsCol } = await import('./store')
  const days = dayKeys(range)
  const docs = (await (await rollupsCol()).find({ _id: { $in: days } } as never).toArray()) as unknown as DailyRollup[]
  return mergeRollups(docs, days)
}

// ─── Shared loaders ─────────────────────────────────────────────────────────

async function signupIds(db: Db, range: DateRange, scope: AnalyticsScope): Promise<string[]> {
  const f = and(inRange('createdAt', range), scope.kind === 'tenant' ? { tenantId: scope.tenantId } : {})
  const users = await db.collection('user').find(f, { projection: { _id: 1, id: 1 } }).limit(MAX_IDS).toArray()
  return users.map((u: Doc) => String(u.id || u._id))
}

/** Of `ids`, the users who did something meaningful (test, practice, hackathon, copilot, purchase). */
async function activatedOf(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const [subs, practice, evs] = await Promise.all([
    db.collection('exam_submissions').distinct('user_id', { user_id: { $in: ids } }),
    db.collection('submissions').distinct('user_id', { user_id: { $in: ids } }),
    db.collection('analytics_events').distinct('user_id', { user_id: { $in: ids }, event: { $in: ['test_submitted', 'hackathon_registered', 'copilot_used', 'purchase', 'marketplace_purchase', 'test_started'] } }),
  ])
  return new Set([...subs, ...practice, ...evs].map(String))
}

async function sellerProducts(db: Db, sellerId: string): Promise<{ ids: string[]; paths: string[] }> {
  const ps = await db.collection('mkt_products').find({ seller_id: sellerId }, { projection: { _id: 0, id: 1, slug: 1 } }).limit(5000).toArray()
  return { ids: ps.map((p: Doc) => String(p.id)), paths: ps.filter((p: Doc) => p.slug).map((p: Doc) => `/marketplace/p/${p.slug}`) }
}

const tsRange = (r: DateRange) => inRange('ts', r)

/** Pure: monthly recurring revenue in major units from active subscriptions and the orders that funded them. */
export function computeMrr(subs: Doc[], ordersById: Map<string, Doc>, planPrices: Record<string, number> = {}): number {
  let mrr = 0
  for (const s of subs) {
    const o = s.last_order_id ? ordersById.get(String(s.last_order_id)) : undefined
    if (o && Number(o.amount_paise) > 0) {
      const amount = Number(o.amount_paise) / 100
      const months = o.interval === 'year' ? 12 : o.interval === 'month' ? 1 : Math.max(1, Math.round((Number(o.duration_days) || 30) / 30))
      mrr += amount / months
    } else {
      const price = planPrices[String(s.plan_id)] || 0
      mrr += /year|annual/i.test(String(s.plan_id)) ? price / 12 : price
    }
  }
  return Math.round(mrr * 100) / 100
}

async function platformCurrency(db: Db): Promise<string> {
  const g = await db.collection('platform_settings').findOne({ key: 'general' })
  return String(g?.value?.platform_currency || 'INR')
}

// ─── KPIs ───────────────────────────────────────────────────────────────────

async function platformNumbers(db: Db, range: DateRange) {
  const traffic = await getTraffic(range)
  const ids = await signupIds(db, range, { kind: 'platform' })
  const activated = await activatedOf(db, ids)
  const paidOrders = await db.collection('billing_orders').find(and({ status: 'paid' }, inRange('created_at', range)), { projection: { _id: 0, user_id: 1, amount_paise: 1 } }).limit(MAX_IDS).toArray()
  const newPaying = new Set(paidOrders.map((o: Doc) => String(o.user_id)))
  const revenue = paidOrders.reduce((s: number, o: Doc) => s + (Number(o.amount_paise) || 0) / 100, 0)
  const mkt = await db.collection('mkt_orders').find(and({ status: { $in: SOLD } }, inRange('created_at', range)), { projection: { _id: 0, grand_total: 1, currency: 1 } }).limit(MAX_IDS).toArray()
  const gmv: Record<string, number> = {}
  for (const o of mkt) gmv[o.currency || 'INR'] = (gmv[o.currency || 'INR'] || 0) + (Number(o.grand_total) || 0)
  const signupsSet = new Set(ids)
  return {
    visitors: traffic.visitors,
    sessions: traffic.sessions,
    pageviews: traffic.pageviews,
    signups: ids.length,
    activated: activated.size,
    newPaying: newPaying.size,
    paidSignups: [...newPaying].filter((u) => signupsSet.has(u)).length,
    revenue: Math.round(revenue * 100) / 100,
    gmv,
    marketplaceOrders: mkt.length,
  }
}

async function tenantNumbers(db: Db, range: DateRange, tenantId: string) {
  const t = { tenant_id: tenantId }
  const examIds = (await db.collection('exams').find(t, { projection: { _id: 0, id: 1 } }).limit(MAX_IDS).toArray()).map((e: Doc) => String(e.id))
  const invites = await db.collection('candidate_invites').find(and(t, inRange('created_at', range)), { projection: { _id: 0, status: 1, started_at: 1 } }).limit(MAX_IDS).toArray()
  const subs = examIds.length
    ? await db.collection('exam_submissions').find(and({ exam_id: { $in: examIds } }, inRange('submitted_at', range)), { projection: { _id: 0, score: 1, max_score: 1 } }).limit(MAX_IDS).toArray()
    : []
  const scored = subs.filter((s: Doc) => Number(s.max_score) > 0)
  const avg = scored.length ? scored.reduce((a: number, s: Doc) => a + Number(s.score || 0) / Number(s.max_score), 0) / scored.length : null
  const { computeAnalytics } = await import('@/lib/ats/analytics')
  const jobs = await db.collection('ats_jobs').find(t, { projection: { _id: 0 } }).limit(2000).toArray()
  const apps = await db.collection('ats_applications').find(and(t, inRange('created_at', range)), { projection: { _id: 0, id: 1, job_id: 1, stage_id: 1, status: 1, source: 1, history: 1, created_at: 1, tenant_id: 1 } }).limit(MAX_IDS).toArray()
  const ats = computeAnalytics(apps as never, jobs as never)
  const copilot = await db.collection('agent_messages').countDocuments(and(t, { role: 'user' }, inRange('created_at', range)))
  return {
    invited: invites.length,
    started: invites.filter((i: Doc) => i.started_at || i.status === 'active' || i.status === 'used').length,
    submitted: subs.length,
    avgScore: avg === null ? null : Math.round(avg * 1000) / 10,
    applications: ats.total,
    hired: ats.hired,
    timeToHire: ats.time_to_hire_days.median,
    copilot,
  }
}

async function sellerNumbers(db: Db, range: DateRange, sellerId: string) {
  const { paths } = await sellerProducts(db, sellerId)
  const views = paths.length ? await db.collection('analytics_events').countDocuments({ event: 'page_view', path: { $in: paths }, ...tsRange(range) }) : 0
  const orders = await db.collection('mkt_orders').find(and({ 'lines.seller_id': sellerId, status: { $in: SOLD } }, inRange('created_at', range)), { projection: { _id: 0, lines: 1, currency: 1 } }).limit(MAX_IDS).toArray()
  let units = 0
  const revenue: Record<string, number> = {}
  for (const o of orders) for (const l of (o.lines || []) as Doc[]) {
    if (l.seller_id !== sellerId) continue
    units += Number(l.qty) || 0
    revenue[o.currency || 'INR'] = (revenue[o.currency || 'INR'] || 0) + (Number(l.line_total) || 0)
  }
  return { views, orders: orders.length, units, revenue }
}

const mainCurrency = (m: Record<string, number>): [string, number] => Object.entries(m).sort((a, b) => b[1] - a[1])[0] ?? ['INR', 0]

export async function getKpis(range: DateRange, scope: AnalyticsScope, opts: { compare?: boolean } = { compare: true }): Promise<Kpi[]> {
  assertScope(scope)
  const db = await getMongoDb()
  const prevRange = previousRange(range)
  const withPrev = (k: Omit<Kpi, 'previous' | 'change'>, prev?: number | null): Kpi =>
    opts.compare && prev !== undefined ? { ...k, previous: prev, change: k.value === null || prev === null ? null : delta(k.value, prev) } : k

  if (scope.kind === 'tenant') {
    const [cur, prev] = await Promise.all([tenantNumbers(db, range, scope.tenantId), opts.compare ? tenantNumbers(db, prevRange, scope.tenantId) : null])
    return [
      withPrev({ key: 'candidates_invited', label: 'Candidates invited', value: cur.invited, unit: 'count' }, prev?.invited),
      withPrev({ key: 'tests_started', label: 'Tests started', value: cur.started, unit: 'count', hint: 'Of the candidates invited in this period' }, prev?.started),
      withPrev({ key: 'tests_submitted', label: 'Tests submitted', value: cur.submitted, unit: 'count' }, prev?.submitted),
      withPrev({ key: 'avg_score', label: 'Average score', value: cur.avgScore, unit: 'percent' }, prev?.avgScore),
      withPrev({ key: 'applications', label: 'Applications', value: cur.applications, unit: 'count' }, prev?.applications),
      withPrev({ key: 'hires', label: 'Hires', value: cur.hired, unit: 'count', hint: 'From applications in this period' }, prev?.hired),
      withPrev({ key: 'time_to_hire', label: 'Time to hire (median)', value: cur.timeToHire, unit: 'days' }, prev?.timeToHire),
      withPrev({ key: 'copilot_messages', label: 'Copilot questions', value: cur.copilot, unit: 'count' }, prev?.copilot),
    ]
  }

  if (scope.kind === 'seller') {
    const [cur, prev] = await Promise.all([sellerNumbers(db, range, scope.sellerId), opts.compare ? sellerNumbers(db, prevRange, scope.sellerId) : null])
    const [ccy, rev] = mainCurrency(cur.revenue)
    return [
      withPrev({ key: 'product_views', label: 'Product page views', value: cur.views, unit: 'count' }, prev?.views),
      withPrev({ key: 'orders', label: 'Orders', value: cur.orders, unit: 'count' }, prev?.orders),
      withPrev({ key: 'units', label: 'Items sold', value: cur.units, unit: 'count' }, prev?.units),
      withPrev({ key: 'revenue', label: 'Sales', value: rev / 100, unit: 'money', currency: ccy }, prev ? (prev.revenue[ccy] || 0) / 100 : undefined),
      withPrev({ key: 'conversion', label: 'Views to orders', value: pct(cur.orders, cur.views), unit: 'percent' }, prev ? pct(prev.orders, prev.views) : undefined),
    ]
  }

  const [cur, prev] = await Promise.all([platformNumbers(db, range), opts.compare ? platformNumbers(db, prevRange) : null])
  const ccy = await platformCurrency(db)
  // Current paying users / MRR are point-in-time (no previous-period value).
  const activeSubs = await db.collection('billing_subscriptions').find({ status: 'active' }, { projection: { _id: 0, user_id: 1, plan_id: 1, last_order_id: 1 } }).limit(MAX_IDS).toArray()
  const orderIds = activeSubs.map((s: Doc) => s.last_order_id).filter(Boolean)
  const orders = orderIds.length ? await db.collection('billing_orders').find({ id: { $in: orderIds } }, { projection: { _id: 0, id: 1, amount_paise: 1, interval: 1, duration_days: 1 } }).toArray() : []
  const plans = await db.collection('plans').find({}, { projection: { _id: 1, id: 1, plan: 1, price: 1 } }).limit(500).toArray()
  const planPrices: Record<string, number> = {}
  for (const p of plans) planPrices[String(p.plan || p.id || p._id)] = Number(p.price) || 0
  const mrr = computeMrr(activeSubs, new Map(orders.map((o: Doc) => [String(o.id), o])), planPrices)
  const [gCcy, gmv] = mainCurrency(cur.gmv)
  return [
    withPrev({ key: 'visitors', label: 'Visitors', value: cur.visitors, unit: 'count', hint: 'Daily unique visitors, summed' }, prev?.visitors),
    withPrev({ key: 'sessions', label: 'Sessions', value: cur.sessions, unit: 'count' }, prev?.sessions),
    withPrev({ key: 'signups', label: 'Sign-ups', value: cur.signups, unit: 'count' }, prev?.signups),
    withPrev({ key: 'activation', label: 'Activation rate', value: pct(cur.activated, cur.signups), unit: 'percent', hint: 'Sign-ups who took a test, practised, joined a hackathon, used the copilot or bought' }, prev ? pct(prev.activated, prev.signups) : undefined),
    { key: 'paying_users', label: 'Paying users', value: new Set(activeSubs.map((s: Doc) => String(s.user_id))).size, unit: 'count', hint: 'Active subscriptions now' },
    withPrev({ key: 'new_paying', label: 'New paying users', value: cur.newPaying, unit: 'count' }, prev?.newPaying),
    { key: 'mrr', label: 'MRR', value: mrr, unit: 'money', currency: ccy, hint: 'From active subscriptions now' },
    withPrev({ key: 'revenue', label: 'Plan revenue', value: cur.revenue, unit: 'money', currency: ccy }, prev?.revenue),
    withPrev({ key: 'marketplace_gmv', label: 'Marketplace GMV', value: gmv / 100, unit: 'money', currency: gCcy }, prev ? (prev.gmv[gCcy] || 0) / 100 : undefined),
    withPrev({ key: 'visit_to_signup', label: 'Visit to sign-up', value: pct(cur.signups, cur.visitors), unit: 'percent' }, prev ? pct(prev.signups, prev.visitors) : undefined),
    withPrev({ key: 'signup_to_paid', label: 'Sign-up to paid', value: pct(cur.paidSignups, cur.signups), unit: 'percent' }, prev ? pct(prev.paidSignups, prev.signups) : undefined),
  ]
}

// ─── Funnels ────────────────────────────────────────────────────────────────

export async function getFunnel(name: FunnelName, range: DateRange, scope: AnalyticsScope): Promise<FunnelResult> {
  assertScope(scope)
  const db = await getMongoDb()
  const label = FUNNELS[name]

  if (name === 'acquisition') {
    if (scope.kind !== 'platform') throw new ScopeError('acquisition funnel is platform-wide')
    const n = await platformNumbers(db, range)
    return computeFunnel(name, label, [
      { key: 'visit', label: 'Visitors', count: n.visitors },
      { key: 'signup', label: 'Signed up', count: n.signups },
      { key: 'activated', label: 'Activated', count: n.activated },
      { key: 'paid', label: 'Paid', count: n.paidSignups },
    ], 'Sign-ups in the period; activated and paid are counted among those sign-ups.')
  }

  if (name === 'candidate') {
    if (scope.kind === 'seller') throw new ScopeError('not available for sellers')
    const invites = await db.collection('candidate_invites').find(and(tenantOnly(scope), inRange('created_at', range)), { projection: { _id: 0, status: 1, started_at: 1 } }).limit(MAX_IDS).toArray()
    const started = invites.filter((i: Doc) => i.started_at || i.status === 'active' || i.status === 'used')
    return computeFunnel(name, label, [
      { key: 'invited', label: 'Invited', count: invites.length },
      { key: 'started', label: 'Started', count: started.length },
      { key: 'submitted', label: 'Submitted', count: invites.filter((i: Doc) => i.status === 'used').length },
    ], 'Invites sent in the period.')
  }

  if (name === 'hiring') {
    if (scope.kind === 'seller') throw new ScopeError('not available for sellers')
    const t = tenantOnly(scope)
    // W4-13: public job pages live at /jobs/<job_postings id> = ats_jobs.legacy_job_id.
    const jobs = await db.collection('ats_jobs').find(t, { projection: { _id: 0, id: 1, legacy_job_id: 1 } }).limit(5000).toArray()
    const jobPaths = jobPagePaths(jobs as Doc[])
    const views = scope.kind === 'platform'
      ? await db.collection('analytics_events').countDocuments({ event: 'page_view', path: { $regex: '^/jobs/[^/]+$' }, ...tsRange(range) })
      : jobPaths.length ? await db.collection('analytics_events').countDocuments({ event: 'page_view', path: { $in: jobPaths }, ...tsRange(range) }) : 0
    const apps = await db.collection('ats_applications').find(and(t, inRange('created_at', range)), { projection: { _id: 0, status: 1 } }).limit(MAX_IDS).toArray()
    return computeFunnel(name, label, [
      { key: 'view', label: 'Job page views', count: views },
      { key: 'applied', label: 'Applied', count: apps.length },
      { key: 'hired', label: 'Hired', count: apps.filter((a: Doc) => a.status === 'hired').length },
    ], 'Applications made in the period; hired counts those applications.')
  }

  // marketplace
  if (scope.kind === 'tenant') throw new ScopeError('not available for organisations')
  const seller = scope.kind === 'seller' ? await sellerProducts(db, scope.sellerId) : null
  const views = seller
    ? seller.paths.length ? await db.collection('analytics_events').countDocuments({ event: 'page_view', path: { $in: seller.paths }, ...tsRange(range) }) : 0
    : await db.collection('analytics_events').countDocuments({ event: 'page_view', path: { $regex: '^/marketplace/p/' }, ...tsRange(range) })
  const carts = await db.collection('mkt_carts').countDocuments(and(seller ? { 'lines.product_id': { $in: seller.ids } } : { 'lines.0': { $exists: true } }, inRange('updated_at', range)))
  const sellerLine = seller ? { 'lines.seller_id': scope.kind === 'seller' ? scope.sellerId : '' } : {}
  const checkout = await db.collection('mkt_orders').countDocuments(and(sellerLine, inRange('created_at', range)))
  const paid = await db.collection('mkt_orders').countDocuments(and(sellerLine, { status: { $in: SOLD } }, inRange('created_at', range)))
  return computeFunnel(name, label, [
    { key: 'view', label: 'Product views', count: views },
    { key: 'cart', label: 'Carts', count: carts },
    { key: 'checkout', label: 'Checkouts', count: checkout },
    { key: 'paid', label: 'Paid orders', count: paid },
  ], 'Carts touched and orders created in the period.')
}

export async function getFunnels(range: DateRange, scope: AnalyticsScope): Promise<FunnelResult[]> {
  const names: FunnelName[] = scope.kind === 'platform' ? ['acquisition', 'candidate', 'hiring', 'marketplace'] : scope.kind === 'tenant' ? ['candidate', 'hiring'] : ['marketplace']
  return Promise.all(names.map((n) => getFunnel(n, range, scope)))
}

// ─── Content ────────────────────────────────────────────────────────────────

export async function getContent(range: DateRange) {
  const db = await getMongoDb()
  const traffic = await getTraffic(range)
  const byPrefix = (prefix: RegExp) => counterRows(Object.fromEntries(Object.entries(traffic.paths).filter(([p]) => prefix.test(p))), 20)
  const learnViews = byPrefix(/^\/learn\/[^/]+$/)
  const slugs = learnViews.map((r) => r.key.split('/')[2])
  const posts = await db.collection('learn_posts').find({ slug: { $in: slugs } }, { projection: { _id: 0, slug: 1, title: 1, stats: 1 } }).toArray()
  const bySlug = new Map(posts.map((p: Doc) => [p.slug, p]))
  const allTime = await db.collection('learn_posts').find({ status: 'published' }, { projection: { _id: 0, slug: 1, title: 1, stats: 1 } }).sort({ 'stats.views': -1 }).limit(10).toArray()
  const eventViews = byPrefix(/^\/events\/[^/]+$/)
  const evIds = eventViews.map((r) => r.key.split('/')[2])
  const evs = await db.collection('events_feed').find({ id: { $in: evIds } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray()
  const evTitle = new Map(evs.map((e: Doc) => [e.id, e.title]))
  const subsCol = db.collection('subscriptions')
  const [newSubscribers, activeSubscribers, savedRows] = await Promise.all([
    subsCol.countDocuments(inRange('created_at', range)),
    subsCol.countDocuments({ $or: [{ email_status: 'active' }, { whatsapp_status: 'active' }] }),
    subsCol.find({ 'saved_events.0': { $exists: true } }, { projection: { _id: 0, saved_events: 1 } }).limit(MAX_IDS).toArray(),
  ])
  return {
    top_pages: counterRows(traffic.paths, 30),
    learn: {
      views_in_range: learnViews.map((r) => ({ slug: r.key.split('/')[2], title: bySlug.get(r.key.split('/')[2])?.title || r.key, views: r.count, shares_all_time: bySlug.get(r.key.split('/')[2])?.stats?.share_total || 0 })),
      top_all_time: allTime.map((p: Doc) => ({ slug: p.slug, title: p.title, views: p.stats?.views || 0, shares: p.stats?.share_total || 0 })),
    },
    events: {
      views_in_range: eventViews.map((r) => ({ id: r.key.split('/')[2], title: evTitle.get(r.key.split('/')[2]) || r.key, views: r.count })),
      new_subscribers: newSubscribers,
      active_subscribers: activeSubscribers,
      saved_reminders: savedRows.reduce((s: number, r: Doc) => s + (r.saved_events?.length || 0), 0),
    },
  }
}

// ─── Product usage + retention ──────────────────────────────────────────────

export async function getUsage(range: DateRange, scope: AnalyticsScope = { kind: 'platform' }) {
  assertScope(scope)
  if (scope.kind === 'seller') throw new ScopeError('not available for sellers')
  const db = await getMongoDb()
  const t = scope.kind === 'tenant' ? { tenant_id: scope.tenantId } : {}
  const DAY = 86_400_000
  const end = new Date(range.to.getTime() - DAY).toISOString().slice(0, 10)
  const monthFrom = new Date(range.to.getTime() - 30 * DAY).toISOString().slice(0, 10)
  const from = range.from.toISOString().slice(0, 10) < monthFrom ? range.from.toISOString().slice(0, 10) : monthFrom
  const ud = await db.collection('analytics_user_days').find({ ...t, day: { $gte: from, $lte: end } }, { projection: { _id: 0, day: 1, user_id: 1 } }).limit(1_000_000).toArray()
  const perDay = new Map<string, Set<string>>()
  for (const r of ud) { const s = perDay.get(r.day) ?? new Set(); s.add(r.user_id); perDay.set(r.day, s) }
  const distinctSince = (d: string) => new Set(ud.filter((r: Doc) => r.day >= d && r.day <= end).map((r: Doc) => r.user_id)).size
  const dau = perDay.get(end)?.size || 0
  const wau = distinctSince(new Date(range.to.getTime() - 7 * DAY).toISOString().slice(0, 10))
  const mau = distinctSince(monthFrom)
  const series = dayKeys(range).map((day) => ({ day, users: perDay.get(day)?.size || 0 }))

  // Feature adoption: distinct users in the range.
  let adoption: { feature: string; users: number }[] = []
  if (scope.kind === 'platform') {
    const d = (c: string, field: string, f: Doc) => db.collection(c).distinct(field, f).then((a) => a.length).catch(() => 0)
    const ev = (names: string[]) => db.collection('analytics_events').distinct('user_id', { event: { $in: names }, ...tsRange(range) }).then((a) => a.filter(Boolean).length)
    const [practice, tests, hackathons, interviews, copilot, marketplace] = await Promise.all([
      d('submissions', 'user_id', inRange('created_at', range)),
      d('exam_submissions', 'user_id', inRange('submitted_at', range)),
      ev(['hackathon_registered']),
      d('interview_sessions', 'candidate_id', inRange('created_at', range)),
      d('ai_usage', 'userId', { feature: 'admin_agent', createdAt: { $gte: range.from, $lt: range.to } }),
      d('mkt_orders', 'buyer_id', and({ status: { $in: SOLD } }, inRange('created_at', range))),
    ])
    adoption = [
      { feature: 'Practice', users: practice }, { feature: 'Tests', users: tests }, { feature: 'Hackathons', users: hackathons },
      { feature: 'Interviews', users: interviews }, { feature: 'Copilot', users: copilot }, { feature: 'Marketplace', users: marketplace },
    ]
  }
  return { dau, wau, mau, stickiness: pct(dau, mau), series, adoption, note: 'Active = signed-in users with a business event, or page views with analytics consent.' }
}

export async function getRetention(weeks: number, scope: AnalyticsScope = { kind: 'platform' }, now = new Date()): Promise<{ weeks: number; cohorts: CohortRow[] }> {
  assertScope(scope)
  if (scope.kind === 'seller') throw new ScopeError('not available for sellers')
  const db = await getMongoDb()
  const w = Math.min(12, Math.max(2, Math.floor(weeks) || 8))
  const since = new Date(now.getTime() - w * 7 * 86_400_000 - 7 * 86_400_000)
  const users = await db.collection('user').find(and({ $or: [{ createdAt: { $gte: since } }, { createdAt: { $gte: since.toISOString() } }] }, scope.kind === 'tenant' ? { tenantId: scope.tenantId } : {}), { projection: { _id: 1, id: 1, createdAt: 1 } }).limit(MAX_IDS).toArray()
  const list = users.map((u: Doc) => ({ id: String(u.id || u._id), signup: new Date(u.createdAt) })).filter((u) => !Number.isNaN(u.signup.getTime()))
  const ids = list.map((u) => u.id)
  const days = ids.length ? await db.collection('analytics_user_days').find({ user_id: { $in: ids }, day: { $gte: since.toISOString().slice(0, 10) } }, { projection: { _id: 0, user_id: 1, day: 1 } }).limit(1_000_000).toArray() : []
  const active = new Map<string, Set<string>>()
  for (const d of days) { const s = active.get(d.user_id) ?? new Set(); s.add(d.day); active.set(d.user_id, s) }
  return { weeks: w, cohorts: cohortRetention(list, active, { weeks: w, now }) }
}

// ─── Revenue ────────────────────────────────────────────────────────────────

export async function getRevenue(range: DateRange) {
  const db = await getMongoDb()
  const ccy = await platformCurrency(db)
  const paid = await db.collection('billing_orders').find(and({ status: { $in: ['paid', 'refunded'] } }, inRange('created_at', range)), { projection: { _id: 0, amount_paise: 1, created_at: 1, plan_id: 1, status: 1 } }).limit(MAX_IDS).toArray()
  const byDay = new Map<string, number>()
  const byPlan: Record<string, number> = {}
  for (const o of paid) {
    const amt = (Number(o.amount_paise) || 0) / 100
    const day = new Date(o.created_at).toISOString().slice(0, 10)
    byDay.set(day, (byDay.get(day) || 0) + amt)
    byPlan[o.plan_id || 'unknown'] = (byPlan[o.plan_id || 'unknown'] || 0) + amt
  }
  const refunds = await db.collection('billing_orders').countDocuments(and({ status: 'refunded' }, inRange('refunded_at', range)))
  const ended = await db.collection('billing_subscriptions').countDocuments(and({ status: { $in: ['cancelled', 'expired'] } }, inRange('ends_at', range)))
  const { buildReport } = await import('@/lib/marketplace/reports')
  const mkt = await buildReport({ from: range.from.toISOString(), to: new Date(range.to.getTime() - 1).toISOString() }).catch(() => null)
  return {
    currency: ccy,
    plan_revenue: Math.round(paid.reduce((s: number, o: Doc) => s + (Number(o.amount_paise) || 0) / 100, 0) * 100) / 100,
    orders: paid.length,
    refunds,
    subscriptions_ended: ended,
    series: dayKeys(range).map((day) => ({ day, revenue: Math.round((byDay.get(day) || 0) * 100) / 100 })),
    by_plan: Object.entries(byPlan).map(([plan, revenue]) => ({ plan, revenue: Math.round(revenue * 100) / 100 })).sort((a, b) => b.revenue - a.revenue),
    marketplace: mkt,
  }
}

// ─── AI usage & cost ────────────────────────────────────────────────────────

export async function getAiUsage(range: DateRange) {
  const db = await getMongoDb()
  const { estimateAiCost } = await import('@/lib/db/analytics')
  const rowsAi = await db.collection('ai_usage').aggregate([
    { $match: { createdAt: { $gte: range.from, $lt: range.to } } },
    { $group: { _id: { user: '$userId', feature: '$feature', model: '$model' }, requests: { $sum: 1 }, prompt: { $sum: { $ifNull: ['$promptTokens', 0] } }, completion: { $sum: { $ifNull: ['$completionTokens', 0] } }, failed: { $sum: { $cond: ['$ok', 0, 1] } } } },
  ]).toArray()
  const userIds = [...new Set(rowsAi.map((r: Doc) => r._id.user).filter(Boolean))]
  const users = userIds.length ? await db.collection('user').find({ $or: [{ id: { $in: userIds } }, { _id: { $in: userIds } }] } as never, { projection: { _id: 1, id: 1, tenantId: 1 } }).toArray() : []
  const tenantOf = new Map(users.map((u: Doc) => [String(u.id || u._id), u.tenantId ? String(u.tenantId) : null]))
  const tenantIds = [...new Set([...tenantOf.values()].filter(Boolean))] as string[]
  const tenants = tenantIds.length ? await db.collection('tenants').find({ id: { $in: tenantIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray() : []
  const tenantName = new Map(tenants.map((t: Doc) => [String(t.id), String(t.name || t.id)]))
  const totals = { requests: 0, failed: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }
  const byFeature = new Map<string, { requests: number; tokens: number; cost_usd: number }>()
  const byModel = new Map<string, { requests: number; tokens: number; cost_usd: number }>()
  const byTenant = new Map<string, { requests: number; tokens: number; cost_usd: number }>()
  const add = (m: Map<string, { requests: number; tokens: number; cost_usd: number }>, k: string, req: number, tok: number, cost: number) => {
    const cur = m.get(k) ?? { requests: 0, tokens: 0, cost_usd: 0 }
    cur.requests += req; cur.tokens += tok; cur.cost_usd += cost
    m.set(k, cur)
  }
  for (const r of rowsAi) {
    const tok = r.prompt + r.completion
    const cost = tok ? estimateAiCost(String(r._id.model || ''), r.prompt, r.completion) : 0
    totals.requests += r.requests; totals.failed += r.failed; totals.prompt_tokens += r.prompt; totals.completion_tokens += r.completion; totals.cost_usd += cost
    add(byFeature, String(r._id.feature || 'unknown').replace(/:cache-hit$/, ' (cached)'), r.requests, tok, cost)
    add(byModel, String(r._id.model || 'unknown'), r.requests, tok, cost)
    const tid = r._id.user ? tenantOf.get(String(r._id.user)) : null
    add(byTenant, tid ? tenantName.get(tid) || tid : 'Individual users', r.requests, tok, cost)
  }
  const list = (m: Map<string, { requests: number; tokens: number; cost_usd: number }>) =>
    [...m.entries()].map(([key, v]) => ({ key, ...v, cost_usd: Math.round(v.cost_usd * 10000) / 10000 })).sort((a, b) => b.requests - a.requests).slice(0, 30)
  const copilot = await db.collection('agent_messages').countDocuments(and({ role: 'user' }, inRange('created_at', range)))
  return {
    totals: { ...totals, cost_usd: Math.round(totals.cost_usd * 100) / 100 },
    by_feature: list(byFeature),
    by_model: list(byModel),
    by_tenant: list(byTenant),
    copilot_questions: copilot,
    note: 'Cost is estimated from list prices per model; calls without token counts are not costed.',
  }
}

// ─── Web vitals by page ─────────────────────────────────────────────────────

export async function getVitals(range: DateRange) {
  const db = await getMongoDb()
  const { percentile75 } = await import('@/lib/web-vitals-stats')
  // ponytail: p75 in memory over ≤ 100k samples; beyond that, sample or use $percentile (MongoDB 7).
  const rowsV = await db.collection('web_vitals_events').find(inRange('created_at', range), { projection: { _id: 0, route: 1, metric_name: 1, metric_value: 1 } }).limit(100_000).toArray()
  const byRoute = new Map<string, Record<string, number[]>>()
  for (const r of rowsV) {
    if (!r.route) continue
    const m = byRoute.get(r.route) ?? {}
    ;(m[r.metric_name] ??= []).push(Number(r.metric_value))
    byRoute.set(r.route, m)
  }
  const pages = [...byRoute.entries()].map(([route, m]) => ({
    route,
    samples: Object.values(m).reduce((s, a) => s + a.length, 0),
    LCP: percentile75(m.LCP ?? []), INP: percentile75(m.INP ?? []), CLS: percentile75(m.CLS ?? []), TTFB: percentile75(m.TTFB ?? []),
  })).sort((a, b) => b.samples - a.samples).slice(0, 50)
  return { pages, samples: rowsV.length }
}

// ─── Organisation assessments ───────────────────────────────────────────────

export async function getAssessmentAnalytics(range: DateRange, scope: AnalyticsScope) {
  assertScope(scope)
  if (scope.kind === 'seller') throw new ScopeError('not available for sellers')
  const db = await getMongoDb()
  const t = tenantOnly(scope)
  const exams = await db.collection('exams').find(t, { projection: { _id: 0, id: 1, title: 1, tenant_id: 1 } }).limit(5000).toArray()
  const examIds = exams.map((e: Doc) => String(e.id))
  const title = new Map(exams.map((e: Doc) => [String(e.id), String(e.title || 'Untitled test')]))
  const invites = await db.collection('candidate_invites').find(and(t, inRange('created_at', range)), { projection: { _id: 0, exam_id: 1, status: 1, started_at: 1 } }).limit(MAX_IDS).toArray()
  const subs = examIds.length
    ? await db.collection('exam_submissions').find(and({ exam_id: { $in: examIds } }, inRange('submitted_at', range)), { projection: { _id: 0, exam_id: 1, score: 1, max_score: 1, auto_submitted: 1 } }).limit(MAX_IDS).toArray()
    : []
  const per = new Map<string, { invited: number; started: number; submitted: number; scores: number[]; auto: number }>()
  const row = (id: string) => { const r = per.get(id) ?? { invited: 0, started: 0, submitted: 0, scores: [], auto: 0 }; per.set(id, r); return r }
  for (const i of invites) {
    if (!i.exam_id) continue
    const r = row(String(i.exam_id))
    r.invited++
    if (i.started_at || i.status === 'active' || i.status === 'used') r.started++
  }
  const buckets = [0, 0, 0, 0, 0]
  for (const s of subs) {
    const r = row(String(s.exam_id))
    r.submitted++
    if (s.auto_submitted) r.auto++
    if (Number(s.max_score) > 0) {
      const p = Math.max(0, Math.min(100, (Number(s.score) || 0) / Number(s.max_score) * 100))
      r.scores.push(p)
      buckets[Math.min(4, Math.floor(p / 20))]++
    }
  }
  const tests = [...per.entries()].filter(([id]) => title.has(id)).map(([id, r]) => ({
    exam_id: id,
    title: title.get(id)!,
    invited: r.invited,
    started: r.started,
    submitted: r.submitted,
    completion_rate: pct(r.submitted, r.invited || r.submitted),
    avg_score: r.scores.length ? Math.round(r.scores.reduce((a, b) => a + b, 0) / r.scores.length * 10) / 10 : null,
    auto_submitted: r.auto,
  })).sort((a, b) => b.submitted - a.submitted || b.invited - a.invited).slice(0, 100)
  return {
    funnel: await getFunnel('candidate', range, scope),
    tests,
    score_distribution: ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'].map((label, i) => ({ label, count: buckets[i] })),
    totals: { tests: exams.length, submissions: subs.length },
  }
}

// ─── Seller sales ───────────────────────────────────────────────────────────

export async function getSellerSales(range: DateRange, scope: AnalyticsScope) {
  assertScope(scope)
  if (scope.kind !== 'seller') throw new ScopeError('seller scope required')
  const db = await getMongoDb()
  const products = await db.collection('mkt_products').find({ seller_id: scope.sellerId }, { projection: { _id: 0, id: 1, slug: 1, title: 1 } }).limit(5000).toArray()
  const paths = products.filter((p: Doc) => p.slug).map((p: Doc) => `/marketplace/p/${p.slug}`)
  const views = paths.length ? await db.collection('analytics_events').find({ event: 'page_view', path: { $in: paths }, ...tsRange(range) }, { projection: { _id: 0, path: 1 } }).limit(500_000).toArray() : []
  const viewsBy = new Map<string, number>()
  for (const v of views) viewsBy.set(v.path, (viewsBy.get(v.path) || 0) + 1)
  const orders = await db.collection('mkt_orders').find(and({ 'lines.seller_id': scope.sellerId, status: { $in: SOLD } }, inRange('created_at', range)), { projection: { _id: 0, lines: 1, currency: 1 } }).limit(MAX_IDS).toArray()
  const sold = new Map<string, { orders: number; units: number; revenue: Record<string, number> }>()
  for (const o of orders) for (const l of (o.lines || []) as Doc[]) {
    if (l.seller_id !== scope.sellerId) continue
    const s = sold.get(l.product_id) ?? { orders: 0, units: 0, revenue: {} }
    s.orders++; s.units += Number(l.qty) || 0
    s.revenue[o.currency || 'INR'] = (s.revenue[o.currency || 'INR'] || 0) + (Number(l.line_total) || 0)
    sold.set(l.product_id, s)
  }
  return {
    kpis: await getKpis(range, scope),
    funnel: await getFunnel('marketplace', range, scope),
    products: products.map((p: Doc) => {
      const v = viewsBy.get(`/marketplace/p/${p.slug}`) || 0
      const s = sold.get(p.id)
      return { id: p.id, title: p.title, views: v, orders: s?.orders || 0, units: s?.units || 0, revenue: s?.revenue || {}, conversion: pct(s?.orders || 0, v) }
    }).sort((a, b) => b.orders - a.orders || b.views - a.views).slice(0, 100),
  }
}

/** W4-13: ats_jobs rows → the public /jobs/<id> paths analytics records (job_postings ids). Pure. */
export function jobPagePaths(jobs: Array<{ legacy_job_id?: unknown }>): string[] {
  const out = new Set<string>()
  for (const j of jobs) {
    const id = typeof j.legacy_job_id === 'string' ? j.legacy_job_id.trim() : ''
    if (id) out.add(`/jobs/${id}`)
  }
  return [...out]
}
