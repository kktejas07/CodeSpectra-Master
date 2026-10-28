/**
 * Pure decision rules for the Wave 15 nudge automations (unit-tested in
 * tests/automation-nudges.test.ts). No I/O here.
 *
 * Shared ideas:
 *   - a "ladder" is a list of reminder offsets before a deadline; only the
 *     latest step that is due goes out, never an earlier one after a later one
 *     (a sweep that was paused never fires three reminders at once);
 *   - a shared frequency cap across every nudge (per person, per day / week)
 *     so nobody gets spammed when several automations want them at once;
 *   - stop conditions are re-checked by the sender right before it sends.
 */

const HOUR = 3_600_000
const DAY = 86_400_000

// ─── Shared frequency cap ───────────────────────────────────────────────────

export type NudgePriority = 'normal' | 'high'

export interface NudgeCaps {
  /** Most nudges per person in any rolling 24 hours. */
  daily: number
  /** Most nudges per person in any rolling 7 days. */
  weekly: number
}

export const NUDGE_CAP_DEFAULTS: NudgeCaps = { daily: 2, weekly: 6 }

/**
 * May one more nudge go to this person? `history` = their earlier nudges (any
 * automation). Deadline-bound nudges (`high`: last-chance test invite, drive in
 * an hour, offer about to expire) get one extra slot per day so a tip sent in
 * the morning never blocks a deadline in the afternoon. The weekly cap holds
 * for everything.
 */
export function capAllows(history: readonly { at: string }[], now: Date, caps: NudgeCaps, priority: NudgePriority = 'normal'): { ok: true } | { ok: false; reason: 'daily_cap' | 'weekly_cap' } {
  const t = now.getTime()
  const inLast = (ms: number) => history.filter((h) => {
    const at = Date.parse(h.at)
    return Number.isFinite(at) && at <= t && t - at < ms
  }).length
  const daily = Math.max(0, Math.floor(caps.daily)) + (priority === 'high' ? 1 : 0)
  const weekly = Math.max(0, Math.floor(caps.weekly))
  if (inLast(7 * DAY) >= weekly) return { ok: false, reason: 'weekly_cap' }
  if (inLast(DAY) >= daily) return { ok: false, reason: 'daily_cap' }
  return { ok: true }
}

// ─── Deadline ladders ───────────────────────────────────────────────────────

/**
 * Which reminder of a ladder is due now. `stepsHours` are offsets before the
 * deadline (any order); a step is due once less than that many hours are left
 * (and the deadline hasn't passed). Returns the closest due step, or null when
 * it — or a closer one — was already sent.
 */
export function dueLadderStep(deadline: string | null | undefined, now: Date, stepsHours: readonly number[], sent: readonly string[]): number | null {
  if (!deadline) return null
  const left = Date.parse(deadline) - now.getTime()
  if (!Number.isFinite(left) || left <= 0) return null
  const steps = [...stepsHours].filter((h) => h > 0).sort((a, b) => b - a)
  const due = steps.filter((h) => left <= h * HOUR)
  if (!due.length) return null
  const latest = due[due.length - 1]
  const sentSet = new Set(sent)
  if (sentSet.has(stepKey(latest))) return null
  if (steps.filter((h) => h < latest).some((h) => sentSet.has(stepKey(h)))) return null
  return latest
}

/** Ledger label of a ladder step ("72h", "2h", "1440h"). */
export const stepKey = (hours: number) => `${hours}h`

/** Test-invite ladder (hours before the invite closes). 24 h belongs to /api/cron/exam-reminders. */
export const INVITE_LADDER_HOURS = [72, 24, 2] as const
export const INVITE_LADDER_OWNED = [72, 2] as const

/**
 * Invite ladder step for this automation: 72 h or 2 h. The 24 h reminder is
 * still sent by the existing cron (marked via `reminded_at`), and counts as
 * sent so we never go backwards from it to 72 h.
 */
export function inviteLadderStep(inv: { expires_at?: string | null; status?: string; reminder_steps?: string[]; reminded_at?: string | null }, now: Date, hasSubmission: boolean): 72 | 2 | null {
  if (hasSubmission) return null
  if (inv.status !== 'pending' && inv.status !== 'active') return null
  const sent = [...(inv.reminder_steps || []), ...(inv.reminded_at ? [stepKey(24)] : [])]
  const step = dueLadderStep(inv.expires_at, now, INVITE_LADDER_HOURS, sent)
  return step === 72 || step === 2 ? step : null
}

// ─── Inactive learner pick ──────────────────────────────────────────────────

export interface PickArea { key: string; label: string; priority: number; mastery: number }
export interface PickItem { id: string; title: string; href: string; area_key?: string | null; kind: string; done_at?: string | null; minutes?: number }

/**
 * One thing to do next for an inactive learner: the first undone plan item in
 * their highest-priority weak area, else any undone practice item, else null
 * (the caller falls back to today's challenge).
 */
export function pickForLearner(plan: { status?: string; weak_areas?: PickArea[]; week?: { items?: PickItem[] } } | null): { title: string; href: string; area: string | null } | null {
  if (!plan || plan.status !== 'active') return null
  const items = (plan.week?.items || []).filter((i) => !i.done_at && typeof i.href === 'string' && i.href.startsWith('/'))
  if (!items.length) return null
  const areas = [...(plan.weak_areas || [])].sort((a, b) => b.priority - a.priority || a.mastery - b.mastery)
  for (const a of areas) {
    const hit = items.find((i) => i.area_key === a.key && i.kind === 'practice') || items.find((i) => i.area_key === a.key)
    if (hit) return { title: hit.title, href: hit.href, area: a.label }
  }
  const any = items.find((i) => i.kind === 'practice') || items[0]
  return { title: any.title, href: any.href, area: null }
}

// ─── Abandoned plan checkout ────────────────────────────────────────────────

export type CheckoutStep = '1h' | '24h'

/** Recovery step for an unpaid plan order: 1 h resume link, then a 24 h coupon. Gives up after 3 days. */
export function checkoutRecoveryStep(order: { status?: string; created_at?: string; plan_kind?: string }, now: Date, sent: readonly string[], paidSince: boolean): CheckoutStep | null {
  if (paidSince) return null
  if (order.status !== 'created' && order.status !== 'attempted') return null
  const age = now.getTime() - Date.parse(String(order.created_at || ''))
  if (!Number.isFinite(age) || age < HOUR || age > 3 * DAY) return null
  const step: CheckoutStep = age >= 24 * HOUR ? '24h' : '1h'
  if (sent.includes(step)) return null
  if (step === '1h' && sent.includes('24h')) return null
  return step
}

/** SEC-035: at most one checkout-recovery coupon per person in this many days. */
export const RECOVERY_COUPON_COOLDOWN_DAYS = 90

/** May this person get a new recovery coupon? `lastIssuedAt` = their newest live recovery coupon. */
export function recoveryCouponAllowed(lastIssuedAt: string | null | undefined, now: Date): boolean {
  if (!lastIssuedAt) return true
  const t = Date.parse(lastIssuedAt)
  return !Number.isFinite(t) || now.getTime() - t >= RECOVERY_COUPON_COOLDOWN_DAYS * 86_400_000
}

/** A short, unguessable single-use coupon code (A–Z, 2–9, no look-alikes). */
export function recoveryCouponCode(rand: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = 'BACK-'
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(rand() * alphabet.length) % alphabet.length]
  return s
}

// ─── Renewals ───────────────────────────────────────────────────────────────

export const LICENCE_RENEWAL_DAYS = [30, 7] as const
export const AUTO_RENEW_NOTICE_DAYS = 3

/**
 * Is this subscription going to be charged automatically at period end? The
 * one answer shared by plan-expiry ("renew now" — only when it won't renew)
 * and renewal-nudges ("we'll charge you" — only when it will), AUTO-093.
 * Stripe renews only while STRIPE_AUTO_RENEW is on (pass stripeAutoRenewEnabled()).
 */
export function autoRenews(sub: { status?: string; billing_mode?: string; cancel_at_period_end?: boolean; past_due?: boolean }, stripeAutoRenew = true): boolean {
  if (sub.status !== 'active' || sub.past_due || sub.cancel_at_period_end) return false
  if (sub.billing_mode === 'stripe_subscription') return stripeAutoRenew
  return sub.billing_mode === 'razorpay_subscription'
}

// ─── Certificate renewal ────────────────────────────────────────────────────

/** 60 days is the existing pro-cert notice (reminder_sent_at); this flow adds 14 and 1 day. */
export const CERT_RENEWAL_DAYS = [60, 14, 1] as const

export function certRenewalStep(cred: { status?: string; expires_at?: string; reminder_sent_at?: string | null; renewal_steps?: string[] }, now: Date, renewed: boolean): 14 | 1 | null {
  if (renewed || cred.status !== 'active') return null
  const sent = [...(cred.renewal_steps || []), ...(cred.reminder_sent_at ? [stepKey(60 * 24)] : [])]
  const step = dueLadderStep(cred.expires_at, now, CERT_RENEWAL_DAYS.map((d) => d * 24), sent)
  if (step === 14 * 24) return 14
  if (step === 24) return 1
  return null
}

// ─── Drives ─────────────────────────────────────────────────────────────────

export const DRIVE_REMINDER_HOURS = [24, 1] as const

/** When a live drive is over for joining purposes: start + duration + late-join window. */
export function driveClosedAt(schedule: { start_at: string; duration_min: number; late_join_min?: number }): number {
  return Date.parse(schedule.start_at) + (Math.max(0, schedule.duration_min) + Math.max(0, schedule.late_join_min || 0)) * 60_000
}

/** A rostered candidate who never started counts as a no-show once joining closed (30 min grace). */
export function isDriveNoShow(c: { state?: string; started_at?: string | null }, closedAtMs: number, now: Date): boolean {
  if (!Number.isFinite(closedAtMs)) return false
  if (now.getTime() < closedAtMs + 30 * 60_000) return false
  return c.state === 'not_started' && !c.started_at
}

// ─── Offers ─────────────────────────────────────────────────────────────────

export type OfferStep = 'candidate_2d' | 'recruiter_5d' | 'expired'
export const OFFER_EXPIRY_DEFAULT_DAYS = 7

/**
 * Follow-up for an unanswered offer (application sitting in an `offer` stage):
 * candidate reminder after 2 days, recruiter escalation after 5, "offer
 * expired" at the deadline (explicit `expires_at` or entered + expiry days).
 */
export function offerStep(enteredAt: string, now: Date, expiresAt: string | null, sent: readonly string[]): OfferStep | null {
  const entered = Date.parse(enteredAt)
  if (!Number.isFinite(entered)) return null
  const days = (now.getTime() - entered) / DAY
  const exp = expiresAt ? Date.parse(expiresAt) : NaN
  if (Number.isFinite(exp) && now.getTime() >= exp) return sent.includes('expired') ? null : 'expired'
  if (days >= 5 && !sent.includes('recruiter_5d')) return 'recruiter_5d'
  if (days >= 2 && days < 5 && !sent.includes('candidate_2d')) return 'candidate_2d'
  return null
}

export function offerDeadline(enteredAt: string, explicit: string | null | undefined, expiryDays: number): string | null {
  if (explicit && Number.isFinite(Date.parse(explicit))) return new Date(Date.parse(explicit)).toISOString()
  const t = Date.parse(enteredAt)
  if (!Number.isFinite(t) || !(expiryDays > 0)) return null
  return new Date(t + expiryDays * DAY).toISOString()
}

// ─── Background checks ──────────────────────────────────────────────────────

export const BGV_SLA_DEFAULT_DAYS = 7

/** Days a vendor check is past its SLA (0 = within SLA). Only checks still in progress at a vendor count. */
export function bgvDaysOverdue(check: { status?: string; info_request?: unknown; updated_at?: string }, orderedAt: string | null | undefined, now: Date, slaDays: number): number {
  if (check.status !== 'in_progress' || check.info_request || !orderedAt) return 0
  const t = Date.parse(orderedAt)
  if (!Number.isFinite(t)) return 0
  const over = (now.getTime() - t) / DAY - Math.max(1, slaDays)
  return over > 0 ? Math.floor(over) + 1 : 0
}

// ─── Mentor sessions ────────────────────────────────────────────────────────

export type SessionOutcome = 'wait' | 'no_show_mentor' | 'no_show_learner' | 'no_show_both' | 'feedback' | 'done'

/**
 * What to do after a mentor session. No-shows are only known for built-in video
 * rooms (joins are recorded); 15 minutes after the end a missing side is a
 * no-show. Otherwise, 2 hours after the end, ask the learner for a rating.
 */
export function sessionOutcome(b: { end: string; status?: string }, joins: { buyer?: string | null; mentor?: string | null } | null, builtInVideo: boolean, now: Date, reviewed: boolean): SessionOutcome {
  const end = Date.parse(b.end)
  if (!Number.isFinite(end) || b.status === 'cancelled' || b.status === 'held') return 'done'
  const since = now.getTime() - end
  if (since < 15 * 60_000) return 'wait'
  if (builtInVideo) {
    const buyer = !!joins?.buyer
    const mentor = !!joins?.mentor
    if (!buyer && !mentor) return 'no_show_both'
    if (!mentor) return 'no_show_mentor'
    if (!buyer) return 'no_show_learner'
  }
  if (since < 2 * HOUR) return 'wait'
  if (reviewed || since > 7 * DAY) return 'done'
  return 'feedback'
}

/** Two or more mentor no-shows in 90 days get flagged to admins. */
export const REPEAT_NO_SHOW_THRESHOLD = 2

// ─── Weekly employer report ─────────────────────────────────────────────────

/** Due for this member: Monday from 09:00 in their time zone. Returns the week key (local Monday date) or null. */
export function weeklyReportDue(now: Date, timeZone: string): string | null {
  let parts: Record<string, string>
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]))
  } catch {
    return weeklyReportDue(now, 'UTC')
  }
  if (parts.weekday !== 'Mon' || Number(parts.hour) < 9) return null
  return `${parts.year}-${parts.month}-${parts.day}`
}

export interface EmployerWeek {
  tests_sent: number
  tests_completed: number
  pass_rate: number | null
  integrity_flags: number
  stage_moves: number
  hires: number
  drives: number
  drive_candidates: number
  talent_accepted: number
}

/** Anything worth emailing? (An empty week sends nothing.) */
export function employerWeekEmpty(w: EmployerWeek): boolean {
  return !(w.tests_sent || w.tests_completed || w.stage_moves || w.hires || w.drives || w.talent_accepted)
}

export function passRate(scores: readonly { score: number; max: number; pass: number | null }[]): number | null {
  const rows = scores.filter((s) => s.max > 0)
  if (!rows.length) return null
  const passed = rows.filter((s) => (s.score / s.max) * 100 >= (s.pass ?? 50)).length
  return Math.round((passed / rows.length) * 100)
}

// ─── Feed source health ─────────────────────────────────────────────────────

export interface SourceHealth {
  id: string
  /** last_run_at already counted (so one pull counts once). */
  seen_run_at: string | null
  /** consecutive bad pulls (error, or empty for too long) */
  bad_streak: number
  first_bad_at: string | null
  last_good_at: string | null
  last_error: string | null
  alerted_at: string | null
  disabled_at: string | null
  /** First of the current run of empty (0 item) pulls — events sources only. */
  empty_since?: string | null
}

export const FEED_BAD_STREAK_ALERT = 3
export const FEED_DISABLE_AFTER_DAYS = 7
/** An events source that used to return items counts as broken after this many days of 0 items. */
export const FEED_EMPTY_BAD_AFTER_DAYS = 3

/**
 * Fold the source's latest pull into its health row (no change if that pull was already counted).
 * `empty`: the pull worked but returned nothing — for a small calendar that's normal, so it only
 * counts as bad after FEED_EMPTY_BAD_AFTER_DAYS of nothing from a source that returned items before.
 * A source seen again after it was auto-switched off was switched back on: start fresh (AUTO-103).
 */
export function nextSourceHealth(prev: SourceHealth | null, pull: { id: string; last_run_at: string | null; ok: boolean; error: string | null; empty?: boolean }): SourceHealth {
  const fresh: SourceHealth = { id: pull.id, seen_run_at: null, bad_streak: 0, first_bad_at: null, last_good_at: null, last_error: null, alerted_at: null, disabled_at: null, empty_since: null }
  const base: SourceHealth = !prev ? fresh : prev.disabled_at ? { ...fresh, seen_run_at: prev.seen_run_at, last_good_at: prev.last_good_at } : prev
  if (!pull.last_run_at || pull.last_run_at === base.seen_run_at) return base
  const good = (): SourceHealth => ({ ...base, seen_run_at: pull.last_run_at, bad_streak: 0, first_bad_at: null, last_good_at: pull.last_run_at, last_error: null, alerted_at: null, disabled_at: null, empty_since: null })
  const bad = (error: string | null): SourceHealth => ({ ...base, seen_run_at: pull.last_run_at, bad_streak: base.bad_streak + 1, first_bad_at: base.first_bad_at || pull.last_run_at, last_error: error })
  if (pull.error && !pull.empty) return bad(pull.error)
  if (pull.empty) {
    const since = base.empty_since || pull.last_run_at
    const neutral: SourceHealth = { ...base, seen_run_at: pull.last_run_at, empty_since: since }
    if (!base.last_good_at) return neutral
    const days = (Date.parse(pull.last_run_at) - Date.parse(since)) / DAY
    return days >= FEED_EMPTY_BAD_AFTER_DAYS ? { ...bad(pull.error || 'No items fetched'), empty_since: since } : neutral
  }
  return pull.ok ? good() : bad(pull.error)
}

export function sourceHealthAction(h: SourceHealth, now: Date, opts: { alertStreak?: number; disableDays?: number } = {}): 'alert' | 'disable' | null {
  const streak = opts.alertStreak ?? FEED_BAD_STREAK_ALERT
  const days = opts.disableDays ?? FEED_DISABLE_AFTER_DAYS
  if (h.bad_streak < streak || h.disabled_at) return null
  const since = h.first_bad_at ? (now.getTime() - Date.parse(h.first_bad_at)) / DAY : 0
  if (since >= days) return 'disable'
  return h.alerted_at ? null : 'alert'
}

// ─── Content freshness ──────────────────────────────────────────────────────

/** Mentions that usually mean a post or question is out of date (word-boundary, case-insensitive). */
export const DEPRECATED_PATTERNS: readonly { re: RegExp; label: string }[] = [
  { re: /\bcomponentWill(Mount|ReceiveProps|Update)\b/, label: 'React legacy lifecycle methods' },
  { re: /\bReact\.createClass\b/, label: 'React.createClass' },
  { re: /\bpython\s?2(\.7)?\b/i, label: 'Python 2' },
  { re: /\burllib2\b/, label: 'urllib2 (Python 2)' },
  { re: /\btf\.Session\(/, label: 'TensorFlow 1 sessions' },
  { re: /\bnew Buffer\(/, label: 'new Buffer() (Node.js)' },
  { re: /\bjava\.util\.Date\b.*\bdeprecated\b|\bnew Date\(\)\.getYear\(\)/, label: 'Deprecated Java/JS date APIs' },
  { re: /\bangularjs\b|\bangular\.module\(/i, label: 'AngularJS (end of life)' },
  { re: /\bvar\s+self\s*=\s*this\b/, label: 'Pre-ES6 JavaScript patterns' },
  { re: /\$\.browser\b|\.live\(\s*['"]/, label: 'Removed jQuery APIs' },
  { re: /\bapt-key add\b/, label: 'apt-key (deprecated)' },
  { re: /\bdocker-compose\s+up\b.*\bversion:\s*['"]?2/, label: 'Compose file v2 syntax' },
  { re: /\bnode\s?(10|12|14)\b(?!\.\d)/i, label: 'End-of-life Node.js version' },
]

export const STALE_AFTER_DAYS = 365

export function stalenessReasons(item: { updated_at?: string | null; text: string; dead_links?: number }, now: Date): string[] {
  const out: string[] = []
  const t = Date.parse(String(item.updated_at || ''))
  if (Number.isFinite(t) && (now.getTime() - t) / DAY >= STALE_AFTER_DAYS) out.push('older_than_12_months')
  for (const p of DEPRECATED_PATTERNS) if (p.re.test(item.text)) out.push(`deprecated:${p.label}`)
  if ((item.dead_links || 0) > 0) out.push(`dead_links:${item.dead_links}`)
  return out
}

/** http(s) links in markdown / text, de-duplicated, at most `max`. */
export function extractLinks(text: string, max = 10): string[] {
  const out = new Set<string>()
  for (const m of String(text || '').matchAll(/https?:\/\/[^\s)<>"'\]]+/g)) {
    const u = m[0].replace(/[.,;:!?]+$/, '')
    out.add(u)
    if (out.size >= max) break
  }
  return [...out]
}

// ─── Cohort at-risk ─────────────────────────────────────────────────────────

export interface AtRiskInput {
  /** published assignments whose due date (+ late window) has passed */
  pastDue: { id: string }[]
  submittedIds: ReadonlySet<string>
  lastActivityAt: string | null
  joinedAt: string
  /** When the cohort started: someone who enrolled early isn't "quiet" before it began (AUTO-096). */
  startsAt?: string | null
  /** Did a live session or an assignment due date fall in the last 7 days? Without one there was nothing to do. */
  hadRecentWork?: boolean
}

/**
 * Missed 2+ assignments, or no activity for 7 days while there was something to
 * do (a session or a due assignment in that week). Inactivity is counted from
 * the last activity, else from the later of joining and the cohort's start.
 */
export function cohortRisk(i: AtRiskInput, now: Date): { at_risk: boolean; missed: number; days_inactive: number; reasons: ('missed_assignments' | 'inactive')[] } {
  const missed = i.pastDue.filter((a) => !i.submittedIds.has(a.id)).length
  const joined = Date.parse(i.joinedAt)
  const start = Date.parse(String(i.startsAt || ''))
  const from = Number.isFinite(start) && (!Number.isFinite(joined) || start > joined) ? start : joined
  const last = i.lastActivityAt ? Date.parse(i.lastActivityAt) : from
  const daysInactive = Number.isFinite(last) ? Math.max(0, Math.floor((now.getTime() - last) / DAY)) : 0
  const reasons: ('missed_assignments' | 'inactive')[] = []
  if (missed >= 2) reasons.push('missed_assignments')
  if (daysInactive >= 7 && i.hadRecentWork !== false) reasons.push('inactive')
  return { at_risk: reasons.length > 0, missed, days_inactive: daysInactive, reasons }
}

// ─── Queued follow-ups ──────────────────────────────────────────────────────

/** A queued follow-up (e.g. referral reward email) older than this is dropped, not sent late (AUTO-092). */
export const FOLLOW_UP_MAX_AGE_DAYS = 3

export function followUpTooOld(createdAt: string | null | undefined, now: Date, maxDays = FOLLOW_UP_MAX_AGE_DAYS): boolean {
  const t = Date.parse(String(createdAt || ''))
  return Number.isFinite(t) && now.getTime() - t > maxDays * DAY
}

// ─── Talent invites ─────────────────────────────────────────────────────────

export type TalentInviteStep = 'day3' | 'last_day'

/** Remind a learner of an unanswered talent-search invite after 3 days and on its last day. */
export function talentInviteStep(inv: { status?: string; created_at: string; expires_at: string }, now: Date, sent: readonly string[]): TalentInviteStep | null {
  if (inv.status !== 'pending') return null
  const exp = Date.parse(inv.expires_at)
  const created = Date.parse(inv.created_at)
  if (!Number.isFinite(exp) || !Number.isFinite(created) || now.getTime() >= exp) return null
  if (exp - now.getTime() <= DAY) return sent.includes('last_day') ? null : 'last_day'
  if (now.getTime() - created >= 3 * DAY && !sent.includes('day3') && !sent.includes('last_day')) return 'day3'
  return null
}
