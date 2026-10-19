/**
 * Approval state machine for Learn posts (pure). Every bot post lands as
 * `draft`; nothing reaches `published` without an admin action (or the
 * opt-in auto-approve setting, which is OFF by default).
 *
 *   draft ──approve──▶ approved ──publish──▶ published ──unpublish──▶ archived
 *     │  ╲──schedule──▶ scheduled ──(time)──▶ published                │
 *     │                    │ unschedule → approved                     │ republish
 *     └──reject──▶ rejected ──reopen──▶ draft ◀──────────reopen────────┘
 */
import type { LearnStatus } from './types'

export const LEARN_ACTIONS = ['approve', 'schedule', 'unschedule', 'publish', 'reject', 'reopen', 'unpublish'] as const
export type LearnAction = (typeof LEARN_ACTIONS)[number]

const TRANSITIONS: Record<LearnStatus, Partial<Record<LearnAction, LearnStatus>>> = {
  draft: { approve: 'approved', schedule: 'scheduled', publish: 'published', reject: 'rejected' },
  approved: { schedule: 'scheduled', publish: 'published', reject: 'rejected', reopen: 'draft' },
  scheduled: { publish: 'published', unschedule: 'approved', reject: 'rejected' },
  published: { unpublish: 'archived' },
  rejected: { reopen: 'draft' },
  archived: { publish: 'published', reopen: 'draft' },
}

export function isLearnAction(v: unknown): v is LearnAction {
  return typeof v === 'string' && (LEARN_ACTIONS as readonly string[]).includes(v)
}

export function allowedActions(status: LearnStatus): LearnAction[] {
  return Object.keys(TRANSITIONS[status] ?? {}) as LearnAction[]
}

export type TransitionResult =
  | { ok: true; status: LearnStatus; set: Record<string, unknown> }
  | { ok: false; error: string }

/**
 * Validate an admin action and return the new status plus the fields to set.
 * `reject` needs a reason; `schedule` needs a future time.
 */
export function transition(
  from: LearnStatus,
  action: LearnAction,
  opts: { reason?: unknown; publishAt?: unknown; actorId?: string | null; now?: Date } = {},
): TransitionResult {
  const to = TRANSITIONS[from]?.[action]
  if (!to) return { ok: false, error: `You can't ${action} a post that is ${from}.` }
  const now = opts.now ?? new Date()
  const nowIso = now.toISOString()
  const set: Record<string, unknown> = { status: to, updated_at: nowIso }
  const review = { reviewed_by: opts.actorId ?? null, reviewed_at: nowIso }

  switch (action) {
    case 'reject': {
      const reason = typeof opts.reason === 'string' ? opts.reason.trim().slice(0, 1000) : ''
      if (!reason) return { ok: false, error: 'Add a reason so the next draft can do better.' }
      Object.assign(set, review, { reject_reason: reason, publish_at: null })
      break
    }
    case 'schedule': {
      const t = typeof opts.publishAt === 'string' ? Date.parse(opts.publishAt) : NaN
      if (!Number.isFinite(t)) return { ok: false, error: 'Pick a date and time to publish.' }
      if (t <= now.getTime()) return { ok: false, error: 'The publish time must be in the future.' }
      Object.assign(set, review, { publish_at: new Date(t).toISOString(), reject_reason: null })
      break
    }
    case 'publish':
      Object.assign(set, review, { published_at: nowIso, publish_at: null, reject_reason: null })
      break
    case 'approve':
      Object.assign(set, review, { reject_reason: null })
      break
    case 'unschedule':
      set.publish_at = null
      break
    case 'unpublish':
      Object.assign(set, review)
      break
    case 'reopen':
      Object.assign(set, { reject_reason: null, publish_at: null })
      break
  }
  return { ok: true, status: to, set }
}

/** Scheduled posts whose time has come (pure filter used by the minute tick). */
export function isDueForPublish(post: { status: string; publish_at?: string | null }, now: Date = new Date()): boolean {
  return post.status === 'scheduled' && !!post.publish_at && Date.parse(post.publish_at) <= now.getTime()
}
