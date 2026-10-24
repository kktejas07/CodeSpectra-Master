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
  // `held:` — a confirmed offer is waiting to be retried (AGT-046): not proposed again meanwhile.
  const marks = await activeMarks('revenue', signals.flatMap((s) => [`proposed:${s.key}`, `done:${s.key}`, `held:${s.key}`]), now)
  return new Set(signals.filter((s) => marks.has(`proposed:${s.key}`) || marks.has(`done:${s.key}`) || marks.has(`held:${s.key}`)).map((s) => s.key))
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
  // Confirmed offers held by the message limit on an earlier run go first (AGT-046 / CORE-052).
  const retry = await retryHeldSends(now).catch(() => ({ retried: 0, sent: 0, dropped: 0 }))
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
    message: `${signals.length} signal(s), ${posted} proposal(s)${pick.cooling ? `, ${pick.cooling} in cooldown` : ''}${failed ? `, ${failed} could not be drafted` : ''}${conversation ? '' : pick.picks.length ? ' (no owner)' : ''}${retry.retried ? `, ${retry.sent} held offer(s) delivered on retry` : ''}${retry.dropped ? `, ${retry.dropped} held offer(s) expired` : ''}`,
    counts: { held_retried: retry.retried, held_sent: retry.sent, held_dropped: retry.dropped, signals: signals.length, proposals: posted, cooling: pick.cooling, failed, renewal: by('renewal'), payment: by('payment'), licence: by('licence'), seats: by('seats'), usage: by('usage'), winback: by('winback'), coupon: by('coupon') },
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

/**
 * Held by the shared message limit (AGT-046 / CORE-052): kept as a pending send
 * that the next daily run retries (up to PENDING_MAX_DAYS), and the signal is
 * kept out of new proposals meanwhile. Never marked done until delivered.
 */
async function holdSend(pendKey: string, signalKey: string, kind: 'upgrade' | 'winback', args: Record<string, unknown>, now: Date): Promise<void> {
  const { savePending, PENDING_MAX_DAYS } = await import('../store')
  await savePending('revenue', pendKey, kind, args, now).catch((e) => logger.warn('[assistants] revenue: could not store held send', { kind, error: (e as Error)?.message }))
  await markOnce('revenue', `held:${signalKey}`, PENDING_MAX_DAYS + 1, now).catch(() => false)
}

async function delivered(pendKey: string): Promise<void> {
  const { clearPending } = await import('../store')
  await clearPending('revenue', pendKey).catch(() => {})
}

const HELD_NOTE = 'held by the message limit, will retry on the next daily run'

export async function sendUpgradeOffer(orgId: string, signalKey: string, reason: string, cooldownDays: number, opts: { only?: string[]; now?: Date; retry?: boolean } = {}) {
  const now = opts.now ?? new Date()
  const to = opts.only ?? await orgAdmins(orgId)
  const { notify } = await import('@/lib/notifications')
  let sent = 0, held = 0
  for (const id of to) {
    const pendKey = `upgrade:${signalKey}:${id}`
    // Marketing class (capped, unsubscribable — AUTO-112); null = held by the limit.
    const r = await notify({
      user_id: id, type: 'billing.upgrade_offer', title: 'Room to grow on your plan',
      title_i18n: { key: 'assistantUpgradeTitle' }, message_i18n: { key: reason === 'seats' ? 'assistantUpgradeSeatsBody' : 'assistantUpgradeUsageBody' },
      link: reason === 'seats' ? '/dashboard/admin/licences' : '/dashboard/pricing', send_email: true,
    })
    if (r) { sent++; await delivered(pendKey) }
    else { held++; await holdSend(pendKey, signalKey, 'upgrade', { org_id: orgId, user_id: id, signal_key: signalKey, reason, cooldown_days: cooldownDays }, now) }
  }
  if (sent) await markOnce('revenue', `done:${signalKey}`, cooldownDays, now).catch(() => false)
  await recordRun({ assistant: 'revenue', trigger: opts.retry ? 'cron' : 'copilot', status: sent ? 'ok' : 'partial', tenant_id: orgId, message: `${opts.retry ? 'Retry: u' : 'U'}pgrade offer (${reason}) sent to ${sent} admin(s)${held ? `, ${held} ${HELD_NOTE}` : ''}`, counts: { sent, held } })
  return { sent, held }
}

/** Win-back: a single-use, 14-day percentage coupon (the coupon service) + a message with the code. */
export async function sendWinbackOffer(actorId: string, userId: string, subscriptionKey: string, percentOff: number, cooldownDays: number, opts: { now?: Date; retry?: boolean } = {}) {
  const now = opts.now ?? new Date()
  const code = winbackCode(subscriptionKey)
  const pendKey = `winback:${subscriptionKey}`
  const args = { actor_id: actorId, user_id: userId, signal_key: subscriptionKey, percent_off: percentOff, cooldown_days: cooldownDays }
  const to = await recipientsFor({ user_id: userId })
  const run = (sent: number, coupon: number, held: boolean, validUntil: string | null) => recordRun({
    assistant: 'revenue', trigger: opts.retry ? 'cron' : 'copilot', status: sent ? 'ok' : 'partial', tenant_id: null,
    message: held ? `${opts.retry ? 'Retry: w' : 'W'}in-back coupon ${code} ${HELD_NOTE}` : `${opts.retry ? 'Retry: w' : 'W'}in-back coupon ${code} (${percentOff}%) sent to ${sent} user(s)${validUntil ? `, valid until ${validUntil}` : ''}`,
    counts: { sent, coupon, held: held ? 1 : 0 },
  })
  // At their limit: don't mint a code nobody receives (CORE-052) — hold it and retry.
  const { budgetHasRoom } = await import('@/lib/messaging/budget')
  if (to.length && !(await budgetHasRoom({ userId: to[0] }, 'marketing', now).catch(() => true))) {
    await holdSend(pendKey, subscriptionKey, 'winback', args, now)
    await run(0, 0, true, null)
    return { code, sent: 0, held: true, valid_until: null as string | null }
  }
  const { createCoupon } = await import('@/lib/billing/coupon-admin')
  let validUntil = new Date(now.getTime() + 14 * DAY).toISOString().slice(0, 10)
  // CORE-049: personal — only the lapsed user can redeem it (a forwarded code is refused).
  const res = await createCoupon(actorId, { code, discount_type: 'percentage', discount_value: percentOff, max_uses: 1, per_user_limit: 1, valid_until: validUntil, applies_to: 'plans' }, { userId })
  if (!res.ok) {
    if (!/already exists/i.test(res.error)) throw new Error(res.error)
    // Minted on an earlier (held) try: quote that coupon's own end date, or give it a fresh 14 days if it lapsed meanwhile.
    const { billingCoupons } = await import('@/lib/db/billing')
    const col = await billingCoupons()
    const c = (await col.findOne({ code, user_id: userId } as never, { projection: { _id: 0, valid_until: 1 } })) as { valid_until?: string } | null
    const cur = c?.valid_until ? String(c.valid_until).slice(0, 10) : ''
    if (cur && cur >= now.toISOString().slice(0, 10)) validUntil = cur
    else if (c) await col.updateOne({ code, user_id: userId } as never, { $set: { valid_until: validUntil } } as never).catch(() => {})
  }
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
  if (sent) {
    await delivered(pendKey)
    await markOnce('revenue', `done:${subscriptionKey}`, cooldownDays, now).catch(() => false)
  } else if (to.length) {
    await holdSend(pendKey, subscriptionKey, 'winback', args, now)
  } else {
    await delivered(pendKey) // the account is gone: nothing left to retry
  }
  const held = !sent && to.length > 0
  await run(sent, res.ok ? 1 : 0, held, validUntil)
  return { code, sent, held, valid_until: held ? null : validUntil }
}

/** Retry confirmed offers held by the message limit (AGT-046 / CORE-052). Bounded; gives up after PENDING_MAX_DAYS. */
export async function retryHeldSends(now = new Date()): Promise<{ retried: number; sent: number; dropped: number }> {
  const { duePending, clearPending, pendingGiveUp, releaseMark } = await import('../store')
  const out = { retried: 0, sent: 0, dropped: 0 }
  for (const p of await duePending('revenue', now, 50)) {
    const a = p.args as Record<string, string | number | undefined>
    const signal = String(a.signal_key || '')
    if (pendingGiveUp(p.attempts, p.created_at, now) || !signal) {
      await clearPending('revenue', p.key).catch(() => {})
      if (signal) await releaseMark('revenue', `held:${signal}`).catch(() => {})
      out.dropped++
      continue
    }
    out.retried++
    try {
      if (p.kind === 'winback') {
        const r = await sendWinbackOffer(String(a.actor_id), String(a.user_id), signal, Number(a.percent_off) || 20, Number(a.cooldown_days) || 14, { now, retry: true })
        out.sent += r.sent
      } else if (p.kind === 'upgrade') {
        const r = await sendUpgradeOffer(String(a.org_id), signal, String(a.reason || 'usage'), Number(a.cooldown_days) || 14, { only: [String(a.user_id)], now, retry: true })
        out.sent += r.sent
      } else {
        await clearPending('revenue', p.key).catch(() => {})
      }
    } catch (e) {
      logger.warn('[assistants] revenue: held send retry failed', { kind: p.kind, error: (e as Error)?.message })
    }
  }
  return out
}
