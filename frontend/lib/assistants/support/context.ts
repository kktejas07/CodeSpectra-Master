/**
 * The support assistant's read-only "tools": each loads facts about the
 * signed-in user ONLY (server only). No loader takes an id from the request or
 * the model; the user id comes from the session. Output is facts as data
 * (./facts renders them: English for the prompt, the user's language for the
 * fallback card) — no
 * emails, phone numbers, payment references or other people's data.
 */
import 'server-only'
import type { Document, Filter } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { SupportContext } from './policy'
import type { SupportFact } from './facts'

export interface SupportUser { id: string; email: string; role: string; tenantId?: string | null }

// SEO-045: loaders return facts as { key, params, dates } (./facts renders them per language).
const iso = (v: unknown) => (typeof v === 'string' && v ? v : null)
const clip = (s: unknown, n = 80) => String(s ?? '').replace(/[\r\n<>]+/g, ' ').trim().slice(0, n)
const e = (v: unknown) => ({ e: clip(v, 30) || 'unknown' })

async function account(u: SupportUser): Promise<SupportFact[]> {
  const db = await getMongoDb()
  const [sub, { getUserAiCredits }, { subState }] = await Promise.all([
    db.collection('billing_subscriptions').find({ user_id: u.id }, { projection: { _id: 0, plan_id: 1, status: 1, ends_at: 1, trial_ends_at: 1, trial_order_id: 1, last_order_id: 1, past_due: 1, cancel_at_period_end: 1, billing_mode: 1 } }).sort({ created_at: -1 }).limit(1).next(),
    import('@/lib/user-credits'),
    import('@/lib/billing/subscription-state'),
  ])
  const out: SupportFact[] = []
  if (sub) {
    const state = subState(sub as never)
    const renew = sub.billing_mode && sub.billing_mode !== 'prepaid' ? (sub.cancel_at_period_end ? 'noRenew' : 'renews') : 'prepaid'
    out.push({ key: 'plan', params: { plan: clip(sub.plan_id, 40), state: { e: state }, renew: { e: renew } }, dates: { ends: iso(sub.ends_at) } })
    if (state === 'past_due') out.push({ key: 'pastDue' })
  } else {
    out.push({ key: 'noSubscription' })
  }
  const c = await getUserAiCredits(u.id).catch(() => null)
  if (c) out.push({ key: c.resets_at ? 'creditsResets' : 'credits', params: { balance: c.balance, allowance: c.allowance, plan: clip(c.plan, 30) }, dates: { resets: iso(c.resets_at) } })
  return out
}

async function tests(u: SupportUser): Promise<SupportFact[]> {
  const db = await getMongoDb()
  const [subs, invites] = await Promise.all([
    db.collection('exam_submissions').find({ user_id: u.id }, { projection: { _id: 0, exam_id: 1, submitted_at: 1, created_at: 1, score: 1, max_score: 1, score_released: 1, released_at: 1 } }).sort({ created_at: -1 }).limit(5).toArray(),
    u.email
      ? db.collection('candidate_invites').find({ $or: [{ user_id: u.id }, { email: u.email.toLowerCase() }], status: { $in: ['pending', 'active'] } } as Filter<Document>, { projection: { _id: 0, exam_id: 1, expires_at: 1, status: 1 } }).sort({ created_at: -1 }).limit(5).toArray()
      : Promise.resolve([]),
  ])
  const ids = [...new Set([...subs, ...invites].map((s) => String(s.exam_id || '')).filter(Boolean))]
  const exams = ids.length ? await db.collection('exams').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray() : []
  const title = new Map(exams.map((x) => [String(x.id), clip(x.title, 70)]))
  const name = (id: unknown) => title.get(String(id)) ?? { e: 'aTest' }
  const out: SupportFact[] = []
  for (const s of subs) {
    const released = s.score_released === true || !!s.released_at
    const max = Number(s.max_score) || 0
    out.push(released && max > 0
      ? { key: 'testScored', params: { title: name(s.exam_id), score: Math.round((Number(s.score) || 0) * 10) / 10, max }, dates: { date: iso(s.submitted_at ?? s.created_at) } }
      : { key: 'testPending', params: { title: name(s.exam_id) }, dates: { date: iso(s.submitted_at ?? s.created_at) } })
  }
  for (const i of invites) out.push(i.expires_at ? { key: 'invite', params: { title: name(i.exam_id) }, dates: { expires: iso(i.expires_at) } } : { key: 'inviteNoExpiry', params: { title: name(i.exam_id) } })
  if (!out.length) out.push({ key: 'noTests' })
  return out
}

async function tickets(u: SupportUser): Promise<SupportFact[]> {
  const rows = await (await getMongoDb()).collection('support_tickets').find({ user_id: u.id }, { projection: { _id: 0, subject: 1, status: 1, created_at: 1, updated_at: 1 } }).sort({ created_at: -1 }).limit(5).toArray()
  if (!rows.length) return [{ key: 'noTickets' }]
  return rows.map((t) => ({ key: 'ticket' as const, params: { subject: clip(t.subject, 70), status: e(t.status) }, dates: { opened: iso(t.created_at), updated: iso(t.updated_at) } }))
}

async function studyPlan(u: SupportUser): Promise<SupportFact[]> {
  const { getPlan } = await import('@/lib/study-plan/service')
  const p = await getPlan(u.id).catch(() => null)
  if (!p) return [{ key: 'noStudyPlan' }]
  const done = p.week.items.filter((i) => i.done_at).length
  return [
    { key: 'studyPlan', params: { target: clip(p.target.label, 50), status: e(p.status), week: p.week.week_no, done, total: p.week.items.length } },
    { key: 'reminders', params: { email: { e: p.reminders.email ? 'on' : 'off' }, whatsapp: { e: p.reminders.whatsapp ? 'on' : 'off' }, hour: p.reminders.hour, tz: clip(p.reminders.timezone, 40) } },
    ...(p.weak_areas.length ? [{ key: 'focus' as const, params: { areas: p.weak_areas.slice(0, 3).map((a) => clip(a.label, 40)).join(', ') } }] : []),
  ]
}

async function orders(u: SupportUser): Promise<SupportFact[]> {
  const { orders: ordersCol } = await import('@/lib/marketplace/order-doc')
  const rows = await (await ordersCol()).find({ buyer_id: u.id }, { projection: { _id: 0, number: 1, status: 1, created_at: 1, 'payment.status': 1 } }).sort({ created_at: -1 }).limit(5).toArray().catch(() => [])
  if (!rows.length) return [{ key: 'noOrders' }]
  return rows.map((o) => ({ key: 'order' as const, params: { number: clip(o.number, 30), status: e(o.status), payment: e(o.payment?.status) }, dates: { placed: iso(o.created_at) } }))
}

/** Organisation admins only: their own organisation's plan and usage (counts, no member names). */
async function org(u: SupportUser): Promise<SupportFact[]> {
  if (u.role !== 'tenant_admin' || !u.tenantId) return []
  const [{ getTenantEntitlements, windowStart }, { limitFor }, { seatsInUse }] = await Promise.all([import('@/lib/entitlements'), import('@/lib/entitlements-core'), import('@/lib/org-invitations')])
  const db = await getMongoDb()
  const [{ planKey, plan }, assessments, seats] = await Promise.all([
    getTenantEntitlements(u.tenantId),
    db.collection('exams').countDocuments({ tenant_id: u.tenantId, createdAt: { $gte: windowStart('month') } }),
    seatsInUse(u.tenantId),
  ])
  const f = (n: number) => (Number.isFinite(n) ? n : { e: 'unlimited' })
  return [{ key: 'org', params: { plan: clip(plan.name || planKey, 40), used: assessments, limit: f(limitFor(plan, 'max_assessments_per_month')), seats, seatLimit: f(limitFor(plan, 'max_seats')) } }]
}

const LOADERS: Record<SupportContext, (u: SupportUser) => Promise<SupportFact[]>> = { account, tests, tickets, study_plan: studyPlan, orders, org }

/** Facts for the chosen contexts (a loader that fails is skipped, never fatal). */
export async function loadFacts(u: SupportUser, contexts: readonly SupportContext[]): Promise<{ facts: SupportFact[]; used: SupportContext[] }> {
  const res = await Promise.all(contexts.map(async (c) => ({ c, f: await LOADERS[c](u).catch(() => [] as SupportFact[]) })))
  return { facts: res.flatMap((r) => r.f).slice(0, 24), used: res.filter((r) => r.f.length).map((r) => r.c) }
}
