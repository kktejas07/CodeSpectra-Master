/**
 * Revenue and renewal agent (server only). Daily: load subscriptions, licences,
 * organisation usage vs plan limits and coupons (bounded reads) → signals
 * (./signals) → up to `max_proposals` copilot proposals for the superadmin who
 * switched the agent on (renewal reminder, upgrade offer, win-back coupon).
 * Nothing is sent or created until that superadmin confirms a proposal; the
 * executors below are what the confirmed tools call.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'
import { logger } from '@/lib/logger'
import { activeMarks, getAssistantSettings, markOnce, proposalOwner, recordRun } from '../store'
import { detectSignals, pickProposals, reminderTopic, winbackCode, type CouponRow, type LicenceRow, type RevenueSignal, type SubRow, type UsageRow } from './signals'

const DAY = 86_400_000

export async function collectSignals(now = new Date(), windowDays = 14): Promise<RevenueSignal[]> {
  const db = await getMongoDb()
  const soon = new Date(now.getTime() + Math.max(windowDays, 30) * DAY).toISOString()
  const lapsed = new Date(now.getTime() - 14 * DAY).toISOString()
  const [subs, licences, coupons] = await Promise.all([
    db.collection('billing_subscriptions').find({ ends_at: { $gte: lapsed, $lte: soon }, status: { $in: ['active', 'expired', 'cancelled', 'past_due'] } }, { projection: { _id: 0, id: 1, user_id: 1, plan_id: 1, status: 1, ends_at: 1, billing_mode: 1, cancel_at_period_end: 1, past_due: 1, grace_ends_at: 1 } }).limit(2000).toArray(),
    db.collection('billing_licences').find({ status: 'active' }, { projection: { _id: 0, id: 1, org_id: 1, org_name: 1, seats: 1, seats_used: 1, status: 1, ends_at: 1 } }).limit(2000).toArray(),
    db.collection('billing_coupons').find({ active: true, seller_id: { $in: [null, undefined] } }, { projection: { _id: 0, id: 1, code: 1, max_uses: 1, current_uses: 1, valid_until: 1, active: 1 } }).limit(500).toArray(),
  ])
  // A lapsed plan that was renewed (a newer live row for the same user) is not a win-back.
  const liveUsers = new Set((await db.collection('billing_subscriptions').find({ user_id: { $in: [...new Set(subs.map((s) => s.user_id))] }, status: 'active', ends_at: { $gt: now.toISOString() } }, { projection: { _id: 0, user_id: 1 } }).limit(5000).toArray()).map((r) => r.user_id))
  const subRows = (subs as unknown as SubRow[]).filter((s) => Date.parse(s.ends_at) > now.getTime() || !liveUsers.has(s.user_id))
  return detectSignals({
    subs: subRows,
    licences: licences as unknown as LicenceRow[],
    usage: await orgUsage(now),
    coupons: coupons.map((c) => ({ id: String(c.id), code: String(c.code), max_uses: Number(c.max_uses) || 0, uses: Number(c.current_uses) || 0, valid_until: c.valid_until ?? null, active: c.active === true })) as CouponRow[],
    windowDays, now,
  })
}

/** Organisations with assessments this month vs their plan's monthly limit (top 200 by usage). */
async function orgUsage(now: Date): Promise<UsageRow[]> {
  const db = await getMongoDb()
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const rows = await db.collection('exams').aggregate<{ _id: string; n: number }>([
    { $match: { tenant_id: { $type: 'string', $ne: '' }, createdAt: { $gte: month } } },
    { $group: { _id: '$tenant_id', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 200 },
  ]).toArray().catch(() => [])
  if (!rows.length) return []
  const [{ getTenantEntitlements }, { limitFor }] = await Promise.all([import('@/lib/entitlements'), import('@/lib/entitlements-core')])
  const names = new Map((await db.collection('tenants').find({ id: { $in: rows.map((r) => r._id) } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()).map((t) => [t.id, String(t.name || '')]))
  const out: UsageRow[] = []
  for (const r of rows) {
    const ent = await getTenantEntitlements(r._id).catch(() => null)
    if (!ent) continue
    out.push({ org_id: r._id, org_name: names.get(r._id) || 'Organisation', plan: String(ent.plan?.name || ent.planKey), used: r.n, limit: limitFor(ent.plan, 'max_assessments_per_month') })
  }
  return out
}

/** Cooldown keys: proposed recently (3 days) or acted on (cooldown_days). */
async function coolingKeys(signals: readonly RevenueSignal[], now: Date): Promise<Set<string>> {
  const marks = await activeMarks('revenue', signals.flatMap((s) => [`proposed:${s.key}`, `done:${s.key}`]), now)
  return new Set(signals.filter((s) => marks.has(`proposed:${s.key}`) || marks.has(`done:${s.key}`)).map((s) => s.key))
}

export function draftFor(s: RevenueSignal): { tool: string; args: Record<string, unknown> } | null {
  if (!s.tool) return null
  if (s.tool === 'send_winback_offer') return { tool: s.tool, args: { user_id: s.subject_id, signal_key: s.key, percent_off: 20, plan: String(s.facts.plan ?? '') } }
  if (s.subject === 'org') return { tool: s.tool, args: { org_id: s.subject_id, signal_key: s.key, reason: s.kind } }
  return { tool: s.tool, args: { user_id: s.subject_id, signal_key: s.key, reason: s.kind } }
}

export async function runRevenueLoop(now = new Date(), trigger: 'cron' | 'manual' = 'cron') {
  const s = await getAssistantSettings('revenue')
  const started = now.toISOString()
  if (!s.enabled) return recordRun({ assistant: 'revenue', trigger, status: 'skipped', started_at: started, tenant_id: null, message: 'Switched off', counts: {} })
  const signals = await collectSignals(now, s.window_days)
  const cooling = await coolingKeys(signals, now)
  const pick = pickProposals(signals, cooling, s.max_proposals)
  const owner = await proposalOwner(s)
  let posted = 0, failed = 0, conversation: string | null = null
  if (pick.picks.length && owner) {
    const { postProposals } = await import('../proactive')
    const hints = await alreadyRemindedHints(pick.picks, now)
    const lines = pick.picks.map((p) => `- ${p.label}${hints.get(p.key) || ''}`).join('\n')
    const insight = signals.filter((x) => !x.tool).slice(0, 5).map((x) => `- ${x.label}`).join('\n')
    const res = await postProposals(
      { userId: owner.id, role: 'superadmin', tenantId: null, email: owner.email, ...(owner.name ? { name: owner.name } : {}) },
      `Revenue and renewals — ${now.toISOString().slice(0, 10)}`,
      `I found ${signals.length} renewal and upgrade signal(s). Drafted ${pick.picks.length} proposal(s); nothing is sent until you confirm.\n\n${lines}${insight ? `\n\nFor your information:\n${insight}` : ''}`,
      pick.picks.map(draftFor).filter((d): d is NonNullable<typeof d> => !!d),
    )
    posted = res.action_ids.length
    failed = res.failed.length
    conversation = res.conversation_id
    for (const p of pick.picks) await markOnce('revenue', `proposed:${p.key}`, 3, now).catch(() => false)
    if (posted) {
      const { notify } = await import('@/lib/notifications')
      // In-app only (no e-mail): the superadmin's own review queue.
      await notify({ user_id: owner.id, type: 'assistant.revenue_proposals', title: 'Revenue proposals to review', message: `${posted} renewal / upgrade proposal(s) are waiting in the AI copilot.`, title_i18n: { key: 'assistantRevenueTitle' }, message_i18n: { key: 'assistantRevenueBody', params: { n: posted } }, link: '/dashboard/admin/agent', skip_push: true })
    }
  } else if (pick.picks.length && !owner) {
    logger.warn('[assistants] revenue: no superadmin to receive proposals')
  }
  const by = (k: string) => signals.filter((x) => x.kind === k).length
  return recordRun({
    assistant: 'revenue', trigger, status: failed && !posted ? 'failed' : failed ? 'partial' : 'ok', started_at: started, tenant_id: null,
    message: `${signals.length} signal(s), ${posted} proposal(s)${pick.cooling ? `, ${pick.cooling} in cooldown` : ''}${failed ? `, ${failed} could not be drafted` : ''}${conversation ? '' : pick.picks.length ? ' (no owner)' : ''}`,
    counts: { signals: signals.length, proposals: posted, cooling: pick.cooling, failed, renewal: by('renewal'), payment: by('payment'), licence: by('licence'), seats: by('seats'), usage: by('usage'), winback: by('winback'), coupon: by('coupon') },
  })
}

// ─── Executors (called by confirmed copilot tools) ──────────────────────────

async function orgAdmins(orgId: string): Promise<string[]> {
  const rows = await (await getMongoDb()).collection('user').find({ role: 'tenant_admin', $or: [{ tenantId: orgId }, { organizationId: orgId }] }, { projection: { id: 1, _id: 1 } }).limit(5).toArray()
  return rows.map((r) => String(r.id ?? r._id))
}

export async function recipientsFor(target: { user_id?: string; org_id?: string }): Promise<string[]> {
  if (target.org_id) return orgAdmins(target.org_id)
  if (!target.user_id) return []
  const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: target.user_id }, { _id: target.user_id as never }] }, { projection: { id: 1, _id: 1 } })
  return u ? [String(u.id ?? u._id)] : []
}

/**
 * " (already reminded by plan-expiry on 2026-10-20)" for proposals whose
 * person already got the same reminder from an automation (AUTO-098).
 */
async function alreadyRemindedHints(picks: readonly RevenueSignal[], now: Date): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const { lastTopicSend } = await import('@/lib/messaging/budget')
  for (const p of picks) {
    if (p.tool !== 'send_renewal_reminder') continue
    const t = reminderTopic(p.key, now)
    if (!t) continue
    const people = p.subject === 'org' ? await orgAdmins(p.subject_id) : [p.subject_id]
    for (const uid of people) {
      const hit = await lastTopicSend({ userId: uid }, t.topic, t.objectPrefix).catch(() => null)
      if (hit) {
        out.set(p.key, ` (already reminded${hit.source ? ` by ${hit.source}` : ''} on ${hit.at.slice(0, 10) || 'an earlier day'})`)
        break
      }
    }
  }
  return out
}

/** Renewal / payment / licence reminder (billing notifications: in-app + e-mail, recipient's language). */
export async function sendRenewalReminder(target: { user_id?: string; org_id?: string }, signalKey: string, reason: string, cooldownDays: number) {
  const to = await recipientsFor(target)
  const { notify } = await import('@/lib/notifications')
  // Same topic as plan-expiry / dunning / renewal-nudges: never a second reminder the same day (AUTO-098).
  const t = reminderTopic(signalKey, new Date())
  let sent = 0, held = 0
  for (const id of to) {
    const r = await notify({
      budget: t ? { class: t.class, topic: t.topic, object: t.object, source: 'revenue-assistant' } : { class: 'deadline', source: 'revenue-assistant' },
      user_id: id, type: reason === 'payment' ? 'billing.payment_failed' : 'billing.renewal_reminder',
      title: reason === 'licence' ? 'Your organisation licence ends soon' : reason === 'payment' ? 'Update your payment method' : 'Your plan ends soon',
      title_i18n: { key: reason === 'licence' ? 'assistantRenewLicenceTitle' : reason === 'payment' ? 'assistantRenewPaymentTitle' : 'assistantRenewPlanTitle' },
      message_i18n: { key: reason === 'licence' ? 'assistantRenewLicenceBody' : reason === 'payment' ? 'assistantRenewPaymentBody' : 'assistantRenewPlanBody' },
      link: reason === 'licence' ? '/dashboard/admin/licences' : '/dashboard/billing', send_email: true,
    })
    if (r) sent++
    else held++
  }
  await markOnce('revenue', `done:${signalKey}`, cooldownDays).catch(() => false)
  await recordRun({ assistant: 'revenue', trigger: 'copilot', status: sent ? 'ok' : 'partial', tenant_id: target.org_id ?? null, message: `Renewal reminder (${reason}) sent to ${sent} recipient(s)${held ? `, ${held} skipped (already reminded today or at their message limit)` : ''}`, counts: { sent, held } })
  return { sent, held }
}

export async function sendUpgradeOffer(orgId: string, signalKey: string, reason: string, cooldownDays: number) {
  const to = await orgAdmins(orgId)
  const { notify } = await import('@/lib/notifications')
  let sent = 0
  for (const id of to) {
    const r = await notify({
      user_id: id, type: 'billing.upgrade_offer', title: 'Room to grow on your plan',
      title_i18n: { key: 'assistantUpgradeTitle' }, message_i18n: { key: reason === 'seats' ? 'assistantUpgradeSeatsBody' : 'assistantUpgradeUsageBody' },
      link: reason === 'seats' ? '/dashboard/admin/licences' : '/dashboard/pricing', send_email: true,
    })
    if (r) sent++
  }
  await markOnce('revenue', `done:${signalKey}`, cooldownDays).catch(() => false)
  await recordRun({ assistant: 'revenue', trigger: 'copilot', status: sent ? 'ok' : 'partial', tenant_id: orgId, message: `Upgrade offer (${reason}) sent to ${sent} admin(s)`, counts: { sent } })
  return { sent }
}

/** Win-back: a single-use, 14-day percentage coupon (the coupon service) + a message with the code. */
export async function sendWinbackOffer(actorId: string, userId: string, subscriptionKey: string, percentOff: number, cooldownDays: number) {
  const { createCoupon } = await import('@/lib/billing/coupon-admin')
  const code = winbackCode(subscriptionKey)
  const validUntil = new Date(Date.now() + 14 * DAY).toISOString().slice(0, 10)
  // CORE-049: personal — only the lapsed user can redeem it (a forwarded code is refused).
  const res = await createCoupon(actorId, { code, discount_type: 'percentage', discount_value: percentOff, max_uses: 1, per_user_limit: 1, valid_until: validUntil, applies_to: 'plans' }, { userId })
  if (!res.ok && !/already exists/i.test(res.error)) throw new Error(res.error)
  const to = await recipientsFor({ user_id: userId })
  const { notify } = await import('@/lib/notifications')
  let sent = 0
  for (const id of to) {
    const r = await notify({
      user_id: id, type: 'billing.winback_offer', title: `${percentOff}% off to come back`,
      title_i18n: { key: 'assistantWinbackTitle', params: { percent: percentOff } },
      message_i18n: { key: 'assistantWinbackBody', params: { code, date: validUntil } },
      link: '/dashboard/pricing', send_email: true,
    })
    if (r) sent++
  }
  await markOnce('revenue', `done:${subscriptionKey}`, cooldownDays).catch(() => false)
  await recordRun({ assistant: 'revenue', trigger: 'copilot', status: sent ? 'ok' : 'partial', tenant_id: null, message: `Win-back coupon ${code} (${percentOff}%) sent to ${sent} user(s)`, counts: { sent, coupon: res.ok ? 1 : 0 } })
  return { code, sent, valid_until: validUntil }
}
