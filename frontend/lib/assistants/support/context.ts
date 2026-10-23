/**
 * The support assistant's read-only "tools": each loads facts about the
 * signed-in user ONLY (server only). No loader takes an id from the request or
 * the model; the user id comes from the session. Output is short English fact
 * lines for the prompt (the answer is written in the user's language) — no
 * emails, phone numbers, payment references or other people's data.
 */
import 'server-only'
import type { Document, Filter } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { SupportContext } from './policy'

export interface SupportUser { id: string; email: string; role: string; tenantId?: string | null }

const d = (iso: unknown) => (typeof iso === 'string' && iso ? iso.slice(0, 10) : 'unknown date')
const clip = (s: unknown, n = 80) => String(s ?? '').replace(/[\r\n<>]+/g, ' ').trim().slice(0, n)

async function account(u: SupportUser): Promise<string[]> {
  const db = await getMongoDb()
  const [sub, { getUserAiCredits }, { subState }] = await Promise.all([
    db.collection('billing_subscriptions').find({ user_id: u.id }, { projection: { _id: 0, plan_id: 1, status: 1, ends_at: 1, trial_ends_at: 1, trial_order_id: 1, last_order_id: 1, past_due: 1, cancel_at_period_end: 1, billing_mode: 1 } }).sort({ created_at: -1 }).limit(1).next(),
    import('@/lib/user-credits'),
    import('@/lib/billing/subscription-state'),
  ])
  const out: string[] = []
  if (sub) {
    const state = subState(sub as never)
    const renew = sub.billing_mode && sub.billing_mode !== 'prepaid' ? (sub.cancel_at_period_end ? 'will not renew' : 'renews automatically') : 'prepaid (does not renew by itself)'
    out.push(`Plan: ${clip(sub.plan_id, 40)}; state ${state}; current period ends ${d(sub.ends_at)}; ${renew}.`)
    if (state === 'past_due') out.push('The last renewal payment failed; access continues until the grace period ends. Updating the payment method on Billing fixes it.')
  } else {
    out.push('No paid subscription on this account (free plan).')
  }
  const c = await getUserAiCredits(u.id).catch(() => null)
  if (c) out.push(`AI credits: ${c.balance} left of ${c.allowance} on ${clip(c.plan, 30)}${c.resets_at ? `, resets ${d(c.resets_at)}` : ''}.`)
  return out
}

async function tests(u: SupportUser): Promise<string[]> {
  const db = await getMongoDb()
  const [subs, invites] = await Promise.all([
    db.collection('exam_submissions').find({ user_id: u.id }, { projection: { _id: 0, exam_id: 1, submitted_at: 1, created_at: 1, score: 1, max_score: 1, score_released: 1, released_at: 1 } }).sort({ created_at: -1 }).limit(5).toArray(),
    u.email
      ? db.collection('candidate_invites').find({ $or: [{ user_id: u.id }, { email: u.email.toLowerCase() }], status: { $in: ['pending', 'active'] } } as Filter<Document>, { projection: { _id: 0, exam_id: 1, expires_at: 1, status: 1 } }).sort({ created_at: -1 }).limit(5).toArray()
      : Promise.resolve([]),
  ])
  const ids = [...new Set([...subs, ...invites].map((s) => String(s.exam_id || '')).filter(Boolean))]
  const exams = ids.length ? await db.collection('exams').find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray() : []
  const title = new Map(exams.map((e) => [String(e.id), clip(e.title, 70)]))
  const out: string[] = []
  for (const s of subs) {
    const released = s.score_released === true || !!s.released_at
    const max = Number(s.max_score) || 0
    out.push(`Test "${title.get(String(s.exam_id)) ?? 'a test'}" submitted ${d(s.submitted_at ?? s.created_at)}; ${released && max > 0 ? `score ${Math.round((Number(s.score) || 0) * 10) / 10} of ${max}` : 'score not released yet (the organiser releases it)'}.`)
  }
  for (const i of invites) out.push(`Open test invite: "${title.get(String(i.exam_id)) ?? 'a test'}", ${i.expires_at ? `expires ${d(i.expires_at)}` : 'no expiry date'}.`)
  if (!out.length) out.push('No test submissions or open test invites on this account.')
  return out
}

async function tickets(u: SupportUser): Promise<string[]> {
  const rows = await (await getMongoDb()).collection('support_tickets').find({ user_id: u.id }, { projection: { _id: 0, subject: 1, status: 1, created_at: 1, updated_at: 1 } }).sort({ created_at: -1 }).limit(5).toArray()
  if (!rows.length) return ['No support tickets yet.']
  return rows.map((t) => `Ticket "${clip(t.subject, 70)}": ${clip(t.status, 20)}, opened ${d(t.created_at)}, last update ${d(t.updated_at)}.`)
}

async function studyPlan(u: SupportUser): Promise<string[]> {
  const { getPlan } = await import('@/lib/study-plan/service')
  const p = await getPlan(u.id).catch(() => null)
  if (!p) return ['No study plan yet (create one on Study plan).']
  const done = p.week.items.filter((i) => i.done_at).length
  return [
    `Study plan for ${clip(p.target.label, 50)} (${p.status}), week ${p.week.week_no}: ${done} of ${p.week.items.length} items done.`,
    `Reminders: email ${p.reminders.email ? 'on' : 'off'}, WhatsApp ${p.reminders.whatsapp ? 'on' : 'off'}, at ${p.reminders.hour}:00 ${clip(p.reminders.timezone, 40)}.`,
    ...(p.weak_areas.length ? [`Focus areas: ${p.weak_areas.slice(0, 3).map((a) => clip(a.label, 40)).join(', ')}.`] : []),
  ]
}

async function orders(u: SupportUser): Promise<string[]> {
  const { orders: ordersCol } = await import('@/lib/marketplace/order-doc')
  const rows = await (await ordersCol()).find({ buyer_id: u.id }, { projection: { _id: 0, number: 1, status: 1, created_at: 1, 'payment.status': 1 } }).sort({ created_at: -1 }).limit(5).toArray().catch(() => [])
  if (!rows.length) return ['No marketplace orders on this account.']
  return rows.map((o) => `Order ${clip(o.number, 30)}: ${clip(o.status, 30)}, payment ${clip(o.payment?.status, 30)}, placed ${d(o.created_at)}.`)
}

/** Organisation admins only: their own organisation's plan and usage (counts, no member names). */
async function org(u: SupportUser): Promise<string[]> {
  if (u.role !== 'tenant_admin' || !u.tenantId) return []
  const [{ getTenantEntitlements, windowStart }, { limitFor }, { seatsInUse }] = await Promise.all([import('@/lib/entitlements'), import('@/lib/entitlements-core'), import('@/lib/org-invitations')])
  const db = await getMongoDb()
  const [{ planKey, plan }, assessments, seats] = await Promise.all([
    getTenantEntitlements(u.tenantId),
    db.collection('exams').countDocuments({ tenant_id: u.tenantId, createdAt: { $gte: windowStart('month') } }),
    seatsInUse(u.tenantId),
  ])
  const f = (n: number) => (Number.isFinite(n) ? String(n) : 'unlimited')
  return [`Your organisation's plan: ${clip(plan.name || planKey, 40)}. Assessments this month: ${assessments} of ${f(limitFor(plan, 'max_assessments_per_month'))}. Seats in use: ${seats} of ${f(limitFor(plan, 'max_seats'))}.`]
}

const LOADERS: Record<SupportContext, (u: SupportUser) => Promise<string[]>> = { account, tests, tickets, study_plan: studyPlan, orders, org }

/** Facts for the chosen contexts (a loader that fails is skipped, never fatal). */
export async function loadFacts(u: SupportUser, contexts: readonly SupportContext[]): Promise<{ facts: string[]; used: SupportContext[] }> {
  const res = await Promise.all(contexts.map(async (c) => ({ c, f: await LOADERS[c](u).catch(() => [] as string[]) })))
  return { facts: res.flatMap((r) => r.f).slice(0, 24), used: res.filter((r) => r.f.length).map((r) => r.c) }
}
