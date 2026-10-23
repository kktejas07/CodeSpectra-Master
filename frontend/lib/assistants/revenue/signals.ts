/**
 * Revenue and renewal agent — pure signal detection and proposal picking
 * (tested in tests/assistants-revenue.test.ts). The daily loop (./service)
 * loads subscriptions, licences and organisation usage; this decides what is
 * worth a proposal. Nothing here sends or charges anything.
 *
 *   renewal       prepaid plan ends within the window, no auto-renew
 *   payment       renewal payment failed (past_due, in grace)
 *   licence       organisation licence ends within the window
 *   seats         licence ≥ 90 % of seats used
 *   usage         organisation ≥ 80 % of its monthly assessment limit
 *   winback       paid plan lapsed in the last 14 days and was not renewed
 *   coupon        a coupon is nearly used up or about to expire (insight only — no outbound)
 */

export type SignalKind = 'renewal' | 'payment' | 'licence' | 'seats' | 'usage' | 'winback' | 'coupon'

export interface RevenueSignal {
  /** Stable key for cooldown / dedupe: kind + subject + period. */
  key: string
  kind: SignalKind
  /** user id (renewal/payment/winback), org id (licence/seats/usage) or coupon id. */
  subject_id: string
  subject: 'user' | 'org' | 'coupon'
  label: string
  /** 0–100: how much attention it deserves (money at stake × urgency). */
  priority: number
  facts: Record<string, string | number | null>
  /** Proposal tool to draft, or null for insight-only signals. */
  tool: 'send_renewal_reminder' | 'send_upgrade_offer' | 'send_winback_offer' | null
}

export interface SubRow { id: string; user_id: string; plan_id: string; status: string; ends_at: string; billing_mode?: string | null; cancel_at_period_end?: boolean | null; past_due?: boolean | null; grace_ends_at?: string | null }
export interface LicenceRow { id: string; org_id: string; org_name: string; seats: number; seats_used: number; status: string; ends_at: string | null }
export interface UsageRow { org_id: string; org_name: string; plan: string; used: number; limit: number }
export interface CouponRow { id: string; code: string; max_uses: number; uses: number; valid_until: string | null; active: boolean }

const DAY = 86_400_000
const daysTo = (iso: string | null | undefined, now: Date) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? Math.ceil((t - now.getTime()) / DAY) : null
}
const urgency = (days: number, window: number) => Math.max(0, Math.min(1, 1 - days / Math.max(1, window)))

export function detectSignals(i: { subs: readonly SubRow[]; licences: readonly LicenceRow[]; usage: readonly UsageRow[]; coupons: readonly CouponRow[]; windowDays: number; now?: Date }): RevenueSignal[] {
  const now = i.now ?? new Date()
  const w = i.windowDays
  const out: RevenueSignal[] = []
  for (const s of i.subs) {
    const d = daysTo(s.ends_at, now)
    if (d === null) continue
    const live = s.status === 'active' && d > 0
    if (live && s.past_due) {
      out.push({ key: `payment:${s.id}:${s.ends_at.slice(0, 10)}`, kind: 'payment', subject: 'user', subject_id: s.user_id, label: `Renewal payment failed (${s.plan_id})`, priority: Math.round(70 + 30 * urgency(d, 7)), facts: { plan: s.plan_id, days_left: d, ends_at: s.ends_at }, tool: 'send_renewal_reminder' })
      continue
    }
    const prepaid = !s.billing_mode || s.billing_mode === 'prepaid'
    if (live && d <= w && (prepaid || s.cancel_at_period_end)) {
      out.push({ key: `renewal:${s.id}:${s.ends_at.slice(0, 10)}`, kind: 'renewal', subject: 'user', subject_id: s.user_id, label: `${s.plan_id} ends in ${d} day(s)`, priority: Math.round(40 + 50 * urgency(d, w)), facts: { plan: s.plan_id, days_left: d, ends_at: s.ends_at, auto_renew: prepaid ? 'no' : 'cancelled' }, tool: 'send_renewal_reminder' })
      continue
    }
    if (d <= 0 && d >= -14 && (s.status === 'expired' || s.status === 'active' || s.status === 'cancelled')) {
      out.push({ key: `winback:${s.id}:${s.ends_at.slice(0, 10)}`, kind: 'winback', subject: 'user', subject_id: s.user_id, label: `${s.plan_id} lapsed ${-d} day(s) ago`, priority: Math.round(30 + 20 * (1 + d / 14)), facts: { plan: s.plan_id, lapsed_days: -d, ended_at: s.ends_at }, tool: 'send_winback_offer' })
    }
  }
  for (const l of i.licences) {
    if (l.status !== 'active') continue
    const d = daysTo(l.ends_at, now)
    if (d !== null && d > 0 && d <= Math.max(w, 30)) {
      out.push({ key: `licence:${l.id}:${String(l.ends_at).slice(0, 10)}`, kind: 'licence', subject: 'org', subject_id: l.org_id, label: `${l.org_name}: licence ends in ${d} day(s)`, priority: Math.round(50 + 45 * urgency(d, Math.max(w, 30))), facts: { org: l.org_name, licence_id: l.id, seats: l.seats, seats_used: l.seats_used, days_left: d, ends_at: l.ends_at }, tool: 'send_renewal_reminder' })
    }
    if (l.seats > 0 && l.seats_used / l.seats >= 0.9) {
      out.push({ key: `seats:${l.id}:${l.seats}`, kind: 'seats', subject: 'org', subject_id: l.org_id, label: `${l.org_name}: ${l.seats_used} of ${l.seats} seats used`, priority: Math.round(45 + 40 * Math.min(1, l.seats_used / l.seats)), facts: { org: l.org_name, licence_id: l.id, seats: l.seats, seats_used: l.seats_used }, tool: 'send_upgrade_offer' })
    }
  }
  for (const u of i.usage) {
    if (!Number.isFinite(u.limit) || u.limit <= 0) continue
    const ratio = u.used / u.limit
    if (ratio >= 0.8) out.push({ key: `usage:${u.org_id}:${now.toISOString().slice(0, 7)}`, kind: 'usage', subject: 'org', subject_id: u.org_id, label: `${u.org_name}: ${u.used} of ${u.limit} assessments this month`, priority: Math.round(40 + 40 * Math.min(1, ratio)), facts: { org: u.org_name, plan: u.plan, used: u.used, limit: u.limit }, tool: 'send_upgrade_offer' })
  }
  for (const c of i.coupons) {
    if (!c.active) continue
    const d = daysTo(c.valid_until, now)
    const nearlyUsed = c.max_uses > 0 && c.uses / c.max_uses >= 0.9
    const ending = d !== null && d >= 0 && d <= 7
    if (nearlyUsed || ending) out.push({ key: `coupon:${c.id}:${nearlyUsed ? 'uses' : 'ends'}`, kind: 'coupon', subject: 'coupon', subject_id: c.id, label: `Coupon ${c.code}: ${nearlyUsed ? `${c.uses} of ${c.max_uses} used` : `ends in ${d} day(s)`}`, priority: 20, facts: { code: c.code, uses: c.uses, max_uses: c.max_uses || null, valid_until: c.valid_until }, tool: null })
  }
  return out.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key))
}

/**
 * Proposals for this run: actionable signals not in cooldown, one per subject
 * (the most urgent), at most `max`. Pure.
 */
export function pickProposals(signals: readonly RevenueSignal[], cooling: ReadonlySet<string>, max: number): { picks: RevenueSignal[]; cooling: number; duplicates: number } {
  const seen = new Set<string>()
  const picks: RevenueSignal[] = []
  let cool = 0, dup = 0
  for (const s of signals) {
    if (!s.tool) continue
    if (cooling.has(s.key)) { cool++; continue }
    const subj = `${s.subject}:${s.subject_id}`
    if (seen.has(subj)) { dup++; continue }
    seen.add(subj)
    if (picks.length < max) picks.push(s)
  }
  return { picks, cooling: cool, duplicates: dup }
}

/** Win-back coupon code: short, unique per subscription, readable. Pure. */
export function winbackCode(subscriptionId: string): string {
  const h = [...subscriptionId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36).toUpperCase()
  return `BACK${h.slice(0, 8)}`
}

/**
 * Shared-budget topic for a renewal / payment / licence reminder (AUTO-098): the
 * same topic and object the automatic reminders use (plan-expiry, dunning,
 * renewal-nudges), so a confirmed proposal never repeats what one of them sent
 * that day. `objectPrefix` finds an earlier send for the "already reminded" hint. Pure.
 */
export function reminderTopic(signalKey: string, now: Date): { class: 'deadline' | 'payment'; topic: string; object: string; objectPrefix: string } | null {
  const [kind, id, ends] = String(signalKey || '').split(':')
  if (!id) return null
  const day = now.toISOString().slice(0, 10)
  if (kind === 'payment') return { class: 'payment', topic: 'payment-failed', object: `${id}:${day}`, objectPrefix: `${id}:` }
  if (kind === 'renewal' && ends) return { class: 'deadline', topic: 'plan-renewal', object: `${id}:${ends}:${day}`, objectPrefix: `${id}:${ends}:` }
  if (kind === 'licence' && ends) return { class: 'payment', topic: 'licence-renewal', object: `${id}:${ends}:${day}`, objectPrefix: `${id}:${ends}:` }
  return null
}
