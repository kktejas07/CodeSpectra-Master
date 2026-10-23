/**
 * Pure decision rules for the built-in system automations (unit-tested in
 * tests/automation-system-rules.test.ts). No I/O here.
 */

import { autoRenews } from '../nudges/rules'

const DAY = 86_400_000
const HOUR = 3_600_000

// ─── Scheduling windows ─────────────────────────────────────────────────────

export type Cadence = { kind: 'interval'; minutes: number } | { kind: 'daily'; hourUtc: number; minuteUtc?: number } | { kind: 'weekly'; weekdayUtc: number; hourUtc: number }

/** Normal minutes between two runs of a cadence (for stale-heartbeat checks). */
export function cadenceMinutes(c: Cadence): number {
  if (c.kind === 'interval') return Math.max(1, Math.floor(c.minutes))
  return c.kind === 'daily' ? 1440 : 10080
}

/**
 * The window a run belongs to, or null when the job is not due yet in this
 * period. Two ticks in the same window produce the same key, so a job claims
 * each window once across replicas.
 */
export function windowKeyFor(c: Cadence, now: Date): string | null {
  if (c.kind === 'interval') {
    const m = Math.max(1, Math.floor(c.minutes))
    return `i${m}:${Math.floor(now.getTime() / (m * 60_000))}`
  }
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  if (c.kind === 'daily') {
    if (minutes < c.hourUtc * 60 + (c.minuteUtc || 0)) return null
    return `d:${now.toISOString().slice(0, 10)}`
  }
  // weekly: due from the given weekday/hour until the end of that week
  const day = now.getUTCDay()
  const since = (day - c.weekdayUtc + 7) % 7
  if (since === 0 && minutes < c.hourUtc * 60) return null
  const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - since))
  return `w:${anchor.toISOString().slice(0, 10)}`
}

// ─── Payment dunning (AU-03) ────────────────────────────────────────────────

export interface DunningStep {
  day: number
  key: 'day0' | 'day3' | 'day7'
  channels: Array<'email' | 'in_app' | 'whatsapp'>
  final: boolean
}

export const DUNNING_SCHEDULE: readonly DunningStep[] = [
  { day: 0, key: 'day0', channels: ['email', 'in_app'], final: false },
  { day: 3, key: 'day3', channels: ['email', 'in_app'], final: false },
  { day: 7, key: 'day7', channels: ['email', 'in_app', 'whatsapp'], final: true },
]

/**
 * Which dunning messages are due now. Only the latest due step is sent (a
 * sequence that was paused for days doesn't fire three emails at once).
 */
export function dueDunningStep(startedAt: string, now: Date, alreadySent: readonly string[], stillPastDue: boolean): DunningStep | null {
  if (!stillPastDue) return null
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return null
  const elapsedDays = (now.getTime() - start) / DAY
  const due = DUNNING_SCHEDULE.filter((s) => elapsedDays >= s.day)
  const latest = due[due.length - 1]
  if (!latest || alreadySent.includes(latest.key)) return null
  // A later step already went out: never go backwards.
  const latestIdx = DUNNING_SCHEDULE.indexOf(latest)
  if (DUNNING_SCHEDULE.slice(latestIdx + 1).some((s) => alreadySent.includes(s.key))) return null
  return latest
}

// ─── Plan expiry (AU-04) ────────────────────────────────────────────────────

export const EXPIRY_REMINDER_DAYS = [7, 3, 1] as const

/**
 * Which reminder (7 / 3 / 1 days) applies to a plan ending at `endsAt`.
 * The window for N days is (N-1, N] days left, so a daily sweep at any hour
 * hits each reminder exactly once.
 */
export function expiryReminderDay(endsAt: string, now: Date): 7 | 3 | 1 | null {
  const left = (Date.parse(endsAt) - now.getTime()) / DAY
  if (!Number.isFinite(left) || left <= 0) return null
  for (const d of EXPIRY_REMINDER_DAYS) if (left <= d && left > d - 1) return d
  return null
}

export function needsExpiryReminder(sub: { status?: string; billing_mode?: string; cancel_at_period_end?: boolean; past_due?: boolean; trial_ends_at?: string | null }, autoRenewEnabled: boolean): boolean {
  if (sub.status !== 'active' || sub.past_due) return false
  // Stripe and Razorpay subscriptions renew on their own unless cancelled (Stripe: unless
  // auto-renew is off platform-wide) — those get the pre-charge notice instead (AUTO-093).
  return !autoRenews(sub, autoRenewEnabled)
}

// ─── Stuck payment reconciliation (AU-05) ───────────────────────────────────

export type ProviderState = 'paid' | 'failed' | 'pending' | 'expired' | 'unknown'
export type ReconcileAction = 'skip' | 'check' | 'give_up'

/** Should we query the gateway for this order now? */
export function reconcileAction(order: { status: string; created_at: string; updated_at?: string }, now: Date): ReconcileAction {
  if (order.status !== 'created' && order.status !== 'attempted') return 'skip'
  const age = now.getTime() - Date.parse(order.created_at)
  if (!Number.isFinite(age) || age < 10 * 60_000) return 'skip' // give the browser / webhook 10 minutes
  if (age > 24 * HOUR) return 'give_up'
  return 'check'
}

/** Final local status after asking the gateway. */
export function reconcileOutcome(provider: ProviderState, ageMs: number): 'paid' | 'failed' | 'pending' {
  if (provider === 'paid') return 'paid'
  if (provider === 'failed' || provider === 'expired') return 'failed'
  // Still pending at the gateway after 24 h: treat as abandoned.
  return ageMs > 24 * HOUR ? 'failed' : 'pending'
}

// ─── Abandoned attempts (AU-02 / A-007) ─────────────────────────────────────

export interface AbandonedCheck {
  deadlineMs: number | null
  graceMs: number
  submittedForAttempt: boolean
  answeredCount: number
}

/** Finalise an attempt the candidate left? Only past deadline + grace, never twice. */
export function shouldFinalizeAttempt(c: AbandonedCheck, now: Date): boolean {
  if (c.submittedForAttempt || c.deadlineMs === null) return false
  return now.getTime() > c.deadlineMs + c.graceMs
}

// ─── Event reminders (AU-09 / A-051 / A-003) ────────────────────────────────

/**
 * Which reminder window a moment `at` is in: '24h' while 1h < left ≤ 24h,
 * '1h' while 0 < left ≤ 1h, else null.
 */
export function reminderWindow(at: string | null | undefined, now: Date): '24h' | '1h' | null {
  if (!at) return null
  const left = Date.parse(at) - now.getTime()
  if (!Number.isFinite(left) || left <= 0) return null
  if (left <= HOUR) return '1h'
  if (left <= 24 * HOUR) return '24h'
  return null
}

export function hoursLeftLabel(at: string, now: Date): string {
  const mins = Math.max(1, Math.round((Date.parse(at) - now.getTime()) / 60_000))
  if (mins < 90) return `${mins} minutes`
  return `${Math.round(mins / 60)} hours`
}

// ─── Re-engagement (AU-12) ──────────────────────────────────────────────────

export const INACTIVE_STEPS = [7, 14, 30] as const

/** 7 / 14 / 30 when the last sign-in was exactly that many days ago (one-day window). */
export function inactivityBucket(lastLoginAt: string | Date | null | undefined, now: Date): 7 | 14 | 30 | null {
  if (!lastLoginAt) return null
  const t = lastLoginAt instanceof Date ? lastLoginAt.getTime() : Date.parse(lastLoginAt)
  if (!Number.isFinite(t)) return null
  const days = (now.getTime() - t) / DAY
  for (const d of INACTIVE_STEPS) if (days >= d && days < d + 1) return d
  return null
}

/** Local hour (0–23) in a time zone, for "around 8 pm" streak savers. */
export function localHour(now: Date, timeZone: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now)
    return Number(h) % 24
  } catch {
    return now.getUTCHours()
  }
}

// ─── Hiring nudges (AU-07) ──────────────────────────────────────────────────

export type HiringNudge = 'sla_warning' | 'idle' | 'offer_pending' | 'assessment_pending' | null

export function hiringNudgeFor(
  stage: { type: string; sla_days?: number | null },
  enteredAt: string,
  now: Date,
  idleDays: number,
  hasResultForStage: boolean,
): HiringNudge {
  const days = (now.getTime() - Date.parse(enteredAt)) / DAY
  if (!Number.isFinite(days) || stage.type === 'hired' || stage.type === 'rejected') return null
  if (stage.sla_days && stage.sla_days > 1 && days >= stage.sla_days - 1 && days < stage.sla_days) return 'sla_warning'
  if (stage.type === 'offer' && days >= 3) return 'offer_pending'
  if (stage.type === 'assessment' && !hasResultForStage && days >= 2) return 'assessment_pending'
  if (days >= idleDays && !(stage.sla_days && days >= stage.sla_days)) return 'idle'
  return null
}

// ─── Grading (AU-01) ────────────────────────────────────────────────────────

export interface GradeDetail {
  qId: string
  correct: boolean
  points: number
  answer: string
  pending_review?: boolean
  awarded?: number
  remarks?: string
  requires_human_review?: boolean
  confidence?: number
  graded_by?: string | null
  jev_agree?: boolean | null
  jev_confidence?: number | null
}

export interface GradeOutcome {
  recommended: number
  feedback: string
  requires_human_review?: boolean
  confidence?: number
  graded_by?: string | null
  jev_agree?: boolean | null
  jev_confidence?: number | null
}

/** Apply grader results to a submission's details; same scoring as the admin "AI grade" button. */
export function applyGrades(details: GradeDetail[], results: Record<string, GradeOutcome>): { details: GradeDetail[]; score: number; pending: boolean; graded: number } {
  let graded = 0
  const next = details.map((d) => {
    const r = results[d.qId]
    if (!r) return d
    graded++
    const max = Number(d.points) || 0
    const awarded = Math.max(0, Math.min(max, Math.round(Number(r.recommended) || 0)))
    return {
      ...d,
      awarded,
      correct: awarded > 0,
      pending_review: !!r.requires_human_review,
      remarks: r.feedback,
      requires_human_review: !!r.requires_human_review,
      confidence: r.confidence,
      jev_agree: r.jev_agree ?? null,
      jev_confidence: r.jev_confidence ?? null,
      graded_by: r.graded_by ?? 'auto',
    }
  })
  let score = 0
  let pending = false
  for (const d of next) {
    if (d.awarded !== undefined) score += d.awarded
    else if (d.correct) score += d.points
    if (d.pending_review) pending = true
  }
  return { details: next, score, pending, graded }
}

/** Details the auto-grader should grade (pending and not already waiting for a human). */
export function detailsToGrade(details: GradeDetail[]): GradeDetail[] {
  return details.filter((d) => d.pending_review === true && !(d.requires_human_review === true && d.awarded !== undefined) && !!String(d.answer || '').trim())
}

// ─── Ops alerts (AU-13) ─────────────────────────────────────────────────────

export interface CronHeartbeat { id: string; last_run_at: string; last_status: 'ok' | 'error' }

/** Jobs that should have run by now but haven't (expected interval × 3, at least 10 min). */
export function staleCrons(rows: CronHeartbeat[], expectedMinutes: Record<string, number>, now: Date): string[] {
  const out: string[] = []
  for (const [id, minutes] of Object.entries(expectedMinutes)) {
    const r = rows.find((x) => x.id === id)
    if (!r) continue // never ran: nothing to compare (the cron page shows "never")
    const age = (now.getTime() - Date.parse(r.last_run_at)) / 60_000
    if (age > Math.max(10, minutes * 3)) out.push(id)
  }
  return out
}

/** A failure rate worth an alert: at least `minCount` failures and ≥ `ratio` of attempts. */
export function isSpike(failures: number, total: number, minCount = 5, ratio = 0.3): boolean {
  return failures >= minCount && total > 0 && failures / total >= ratio
}

// ─── Certificates (AU-16) ───────────────────────────────────────────────────

export function linkedInAddUrl(p: { title: string; verifyUrl: string; issuedAt: string; certId?: string; orgName?: string }): string {
  const d = new Date(p.issuedAt)
  const q = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: p.title.slice(0, 200),
    organizationName: p.orgName || 'CodeSpectra',
    issueYear: String(d.getUTCFullYear()),
    issueMonth: String(d.getUTCMonth() + 1),
    certUrl: p.verifyUrl,
    ...(p.certId ? { certId: p.certId } : {}),
  })
  return `https://www.linkedin.com/profile/add?${q.toString()}`
}
