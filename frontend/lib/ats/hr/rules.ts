/**
 * HR round — pure rules (unit tested in tests/ats-hr-round.test.ts): stage
 * config defaults, signed form-link tokens, reminder timing and the decision gate.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ApplicationStatus, HrRoundConfig, PipelineStage } from '../contract'

export const HR_FORM_LINK_GRACE_DAYS = 7
const DAY = 86_400_000

/** The stage's HR config with defaults (collect on, 3-day deadline, no interview). */
export function hrConfig(stage: Pick<PipelineStage, 'type' | 'config'>): HrRoundConfig | null {
  if (stage.type !== 'hr_round') return null
  const c = stage.config?.kind === 'hr_round' ? stage.config : null
  return {
    kind: 'hr_round',
    collect_compensation: c?.collect_compensation !== false,
    form_deadline_days: Math.max(1, Math.min(30, c?.form_deadline_days || 3)),
    interview: c?.interview ?? null,
  }
}

/** Deadline + the half-way reminder for a form sent at `sentAt`. */
export function formTimes(sentAt: Date, deadlineDays: number): { deadline: string; remind_at: string; link_expires: number } {
  const d = Math.max(1, deadlineDays)
  return {
    deadline: new Date(sentAt.getTime() + d * DAY).toISOString(),
    remind_at: new Date(sentAt.getTime() + (d * DAY) / 2).toISOString(),
    link_expires: sentAt.getTime() + (d + HR_FORM_LINK_GRACE_DAYS) * DAY,
  }
}

// ─── Signed link ─────────────────────────────────────────────────────────────
// Token = base64url(JSON {k:'hr', i: form id, n: nonce, e: expiry ms}) + "." + base64url(HMAC-SHA256).
// The nonce lives on the form; "resend link" rotates it so older links die.

export interface HrTokenPayload { k: 'hr'; i: string; n: string; e: number }

export const newHrNonce = () => randomBytes(12).toString('hex')

export function signHrToken(key: Uint8Array, p: Omit<HrTokenPayload, 'k'>): string {
  const body = Buffer.from(JSON.stringify({ k: 'hr', i: p.i, n: p.n, e: p.e })).toString('base64url')
  const sig = createHmac('sha256', Buffer.from(key)).update(body).digest().toString('base64url')
  return `${body}.${sig}`
}

export function verifyHrToken(key: Uint8Array, token: unknown, now = Date.now()): HrTokenPayload | null {
  if (typeof token !== 'string' || token.length > 600 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null
  const [body, sig] = token.split('.')
  const expected = createHmac('sha256', Buffer.from(key)).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  let p: Partial<HrTokenPayload>
  try { p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) } catch { return null }
  if (!p || p.k !== 'hr' || typeof p.i !== 'string' || typeof p.n !== 'string' || typeof p.e !== 'number') return null
  if (p.e < now) return null
  return p as HrTokenPayload
}

// ─── Decision gate ───────────────────────────────────────────────────────────

export type HrDecision = 'pass' | 'fail' | 'hold'

export interface HrDecisionInput {
  decision: unknown
  stageType: string | null | undefined
  appStatus: ApplicationStatus
  collect: boolean
  formSubmitted: boolean
  /** pass before the form is in: the recruiter must say why */
  override?: { reason?: unknown } | null
}

export type HrGate = { ok: true; decision: HrDecision; overrideReason: string | null } | { ok: false; status: 400 | 409; error: string }

export function hrDecisionGate(i: HrDecisionInput): HrGate {
  const decision = (['pass', 'fail', 'hold'] as const).find((d) => d === i.decision)
  if (!decision) return { ok: false, status: 400, error: "decision must be 'pass', 'fail' or 'hold'" }
  if (i.stageType !== 'hr_round') return { ok: false, status: 409, error: 'This candidate is not in an HR round' }
  if (i.appStatus !== 'active' && i.appStatus !== 'on_hold') return { ok: false, status: 409, error: 'This application is not active' }
  let overrideReason: string | null = null
  if (decision === 'pass' && i.collect && !i.formSubmitted) {
    const reason = typeof i.override?.reason === 'string' ? i.override.reason.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 300) : ''
    if (!i.override) return { ok: false, status: 409, error: 'The candidate hasn’t submitted the compensation form yet. Wait for it, or pass with an override and a reason.' }
    if (reason.length < 5) return { ok: false, status: 400, error: 'Give a reason for passing without the compensation form' }
    overrideReason = reason
  }
  return { ok: true, decision, overrideReason }
}
