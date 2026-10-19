/**
 * Didit KYC webhook replay protection (SEC-020). Pure, unit tested.
 */
export const KYC_FINAL = new Set(['approved', 'rejected'])
export const WEBHOOK_MAX_SKEW_SEC = 300

/** Didit status → our status. */
export function mapDiditStatus(status: unknown): string {
  if (status === 'Approved') return 'approved'
  if (status === 'Declined') return 'rejected'
  if (status === 'In Review') return 'manual_review'
  return 'pending'
}

/**
 * Freshness from the SIGNED body (`timestamp`, unix seconds) — the
 * x-timestamp header is not covered by the HMAC, so it alone proves nothing.
 * A body without a timestamp falls back to the header check done by the caller.
 */
export function bodyTimestampFresh(body: Record<string, unknown>, nowSec = Date.now() / 1000): boolean | null {
  const t = Number(body.timestamp)
  if (!Number.isFinite(t) || t <= 0) return null
  return Math.abs(nowSec - t) <= WEBHOOK_MAX_SKEW_SEC
}

/** A session never moves out of a final or manually reviewed decision. */
export function kycTransitionAllowed(current: Record<string, unknown> | null, next: string): boolean {
  if (!current) return true
  if (current.reviewed_by) return false
  const cur = String(current.status ?? '')
  if (KYC_FINAL.has(cur)) return false
  return true
}
