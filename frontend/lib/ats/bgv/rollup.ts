/**
 * BGV case roll-up, US adverse-action timing and retention purge — pure
 * (tests/ats-bgv.test.ts).
 *
 * Roll-up rules:
 *  - failed / cancelled are final (set by a decision / deadline / cancel).
 *  - a recruiter decision on a 'consider' case wins (pass → clear).
 *  - before the candidate submits: invited (nothing yet) / in_progress.
 *  - a check reopened with "request more info" → in_progress.
 *  - any discrepancy on a critical check → consider (no need to wait).
 *  - every check decided: a critical check unable_to_verify → consider, else
 *    clear (non-critical discrepancies are noted in the summary, not blocking).
 *  - otherwise verifying once a verifier / vendor has started, else submitted.
 */
import type { BgvCheckType } from '@/lib/ats/contract'
import { DECIDED, type BgvAdverseAction, type BgvCaseDoc, type BgvCaseStatus, type BgvCheck } from './types'

type RollupInput = Pick<BgvCaseDoc, 'status' | 'checks' | 'critical_checks' | 'consent' | 'submitted_at' | 'decision'>

export function rollUpStatus(c: RollupInput): BgvCaseStatus {
  if (c.status === 'failed' || c.status === 'cancelled') return c.status
  if (c.decision?.outcome === 'pass') return 'clear'
  if (c.decision?.outcome === 'fail') return 'failed'
  const checks = c.checks || []
  if (!c.submitted_at) {
    const started = !!c.consent || checks.some((k) => Object.keys(k.data || {}).length > 0 || (k.documents || []).length > 0)
    return started ? 'in_progress' : 'invited'
  }
  if (checks.some((k) => k.info_request)) return 'in_progress'
  const critical = new Set<BgvCheckType>(c.critical_checks || [])
  if (checks.some((k) => critical.has(k.type) && k.status === 'discrepancy')) return 'consider'
  if (checks.length && checks.every((k) => DECIDED.has(k.status))) {
    return checks.some((k) => critical.has(k.type) && k.status === 'unable_to_verify') ? 'consider' : 'clear'
  }
  return checks.some((k) => k.status !== 'submitted' && k.status !== 'not_started') ? 'verifying' : 'submitted'
}

export function caseSummary(c: Pick<BgvCaseDoc, 'checks' | 'critical_checks'>, label: (t: BgvCheckType) => string): string {
  const critical = new Set(c.critical_checks || [])
  const by = (s: BgvCheck['status']) => c.checks.filter((k) => k.status === s)
  const parts: string[] = []
  const verified = by('verified').length
  const waived = by('waived').length
  parts.push(`${verified} of ${c.checks.length} checks verified${waived ? `, ${waived} waived` : ''}`)
  const disc = by('discrepancy')
  if (disc.length) parts.push(`discrepancy: ${disc.map((k) => `${label(k.type)}${critical.has(k.type) ? ' (critical)' : ''}`).join(', ')}`)
  const unable = by('unable_to_verify')
  if (unable.length) parts.push(`unable to verify: ${unable.map((k) => label(k.type)).join(', ')}`)
  return parts.join('; ')
}

/** Share of candidate-side work done (0–100) for the portal progress bar. */
export function progressPercent(done: number, total: number): number {
  return total <= 0 ? 100 : Math.round((Math.min(done, total) / total) * 100)
}

// ─── Business days (US adverse action) ──────────────────────────────────────
// ponytail: weekends only, no public holidays — the waiting period is a
// minimum and recruiters confirm the final notice themselves.

export function isBusinessDay(d: Date): boolean {
  const w = d.getUTCDay()
  return w !== 0 && w !== 6
}

/** `from` + n business days (same time of day), skipping Saturdays and Sundays. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from.getTime())
  let left = Math.max(0, Math.floor(n))
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isBusinessDay(d)) left--
  }
  return d
}

export function startAdverse(now: Date, waitingDays: number, reason: string | null, by: string): BgvAdverseAction {
  const days = Math.max(1, Math.min(30, Math.floor(waitingDays || 5)))
  return {
    pre_adverse_sent_at: now.toISOString(),
    waiting_days: days,
    earliest_final_at: addBusinessDays(now, days).toISOString(),
    final_sent_at: null,
    reason: reason ? reason.slice(0, 1000) : null,
    by,
    wait_over_notified: false,
    withdrawn_at: null,
  }
}

/** Can the final adverse notice go out now? */
export function canSendFinalAdverse(a: BgvAdverseAction | null | undefined, now = new Date()): boolean {
  if (!a?.pre_adverse_sent_at || a.final_sent_at || a.withdrawn_at || !a.earliest_final_at) return false
  return now.getTime() >= Date.parse(a.earliest_final_at)
}

// ─── Retention purge ─────────────────────────────────────────────────────────

/** Has the retention period after closing elapsed? */
export function purgeDue(c: Pick<BgvCaseDoc, 'closed_at' | 'purged_at'>, retentionDays: number, now = new Date()): boolean {
  if (c.purged_at || !c.closed_at || !(retentionDays > 0)) return false
  return now.getTime() >= Date.parse(c.closed_at) + retentionDays * 86_400_000
}

/**
 * The case after a purge: documents, candidate data, ciphertext and notes are
 * gone; check types, statuses, verifier/vendor refs, consent timestamps and the
 * overall outcome stay. Returns the purged case and the document ids to delete.
 */
export function purgedCase(c: BgvCaseDoc, reason: 'retention' | 'candidate_request', now = new Date()): { doc: BgvCaseDoc; documentIds: string[] } {
  const documentIds = c.checks.flatMap((k) => (k.documents || []).map((d) => d.id))
  const at = now.toISOString()
  return {
    documentIds,
    doc: {
      ...c,
      checks: c.checks.map((k) => ({
        type: k.type,
        status: k.status,
        data: {},
        enc: null,
        documents: [],
        notes: null,
        verified_by: k.verified_by ?? null,
        verified_at: k.verified_at ?? null,
        vendor_ref: k.vendor_ref ?? null,
        info_request: null,
        updated_at: at,
      })),
      consent: c.consent ? { signed_at: c.consent.signed_at, version: c.consent.version, ip: '', name: '', disclosure_version: c.consent.disclosure_version ?? null, withdrawn_at: c.consent.withdrawn_at ?? null } : null,
      candidate_email: null,
      adverse_action: c.adverse_action ? { ...c.adverse_action, reason: null } : c.adverse_action,
      decision: c.decision ? { ...c.decision, note: null } : c.decision,
      purged_at: at,
      purge_reason: reason,
      updated_at: at,
    },
  }
}
