/**
 * Hackathon submission state machine. Pure, client-safe, no I/O.
 *
 *   submitted ──► under_review ──► scored ──► released (final)
 *       │              │   ▲          │
 *       │              ▼   │          ▼
 *       └──────────► rejected ◄───────┘
 *
 * - A judge score (or an auto-grade) moves a live submission to `scored`.
 * - `rejected` can be reinstated to `under_review`; `scored` can be re-opened.
 * - Only the release-results route moves anything to `released`, and nothing
 *   leaves `released` (scores are locked once results are public).
 *
 * Older docs carry `pending`, `review_completed` or `accepted`; read them
 * through `normalizeSubmissionStatus` so they keep working.
 */

export const SUBMISSION_STATUSES = ['submitted', 'under_review', 'scored', 'released', 'rejected'] as const
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

const LEGACY: Record<string, SubmissionStatus> = {
  pending: 'submitted',
  review_completed: 'scored',
  accepted: 'scored',
}

/** Map any stored status (including legacy values) to a canonical one. Unknown → submitted. */
export function normalizeSubmissionStatus(raw: unknown): SubmissionStatus {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if ((SUBMISSION_STATUSES as readonly string[]).includes(s)) return s as SubmissionStatus
  return LEGACY[s] || 'submitted'
}

/** Manual transitions a judge/admin may request. `released` is release-route only. */
export const SUBMISSION_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  submitted: ['under_review', 'scored', 'rejected'],
  under_review: ['scored', 'rejected', 'submitted'],
  scored: ['under_review', 'rejected'],
  rejected: ['under_review'],
  released: [],
}

export function canTransition(from: unknown, to: unknown): boolean {
  const f = normalizeSubmissionStatus(from)
  if (typeof to !== 'string' || !(SUBMISSION_STATUSES as readonly string[]).includes(to)) return false
  return SUBMISSION_TRANSITIONS[f].includes(to as SubmissionStatus)
}

/** Status a submission lands in after a judge score is recorded, or null when scoring is locked. */
export function statusAfterScore(from: unknown): SubmissionStatus | null {
  const f = normalizeSubmissionStatus(from)
  if (f === 'released' || f === 'rejected') return null
  return 'scored'
}

/** Whether the release route should publish this submission. */
export function isReleasable(status: unknown, hasScore: boolean): boolean {
  const s = normalizeSubmissionStatus(status)
  if (s === 'rejected' || s === 'released') return false
  return hasScore
}

/** Statuses a team may still edit (resubmit) — anything not yet final or judged out. */
export function teamCanEdit(status: unknown): boolean {
  const s = normalizeSubmissionStatus(status)
  return s === 'submitted' || s === 'under_review' || s === 'scored'
}

export interface StatusHistoryEntry {
  status: SubmissionStatus
  changed_by: string
  changed_at: string
  reason?: string
}

/**
 * Build a Mongo update for a status change. `$push` lives next to `$set`,
 * never inside it (Mongo refuses `$`-prefixed field names in `$set`).
 */
export function buildStatusUpdate(
  to: SubmissionStatus,
  by: string,
  at: string,
  extraSet: Record<string, unknown> = {},
  reason?: string,
): { $set: Record<string, unknown>; $push: { status_history: StatusHistoryEntry } } {
  const entry: StatusHistoryEntry = { status: to, changed_by: by, changed_at: at }
  if (reason) entry.reason = reason
  return {
    $set: { ...extraSet, status: to, updated_at: at },
    $push: { status_history: entry },
  }
}
