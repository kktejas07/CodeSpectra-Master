/**
 * Subscription state machine (pure). The stored `billing_subscriptions` row
 * keeps its historical fields (status + past_due + trial_ends_at +
 * cancel_at_period_end); this maps them onto the five states the product
 * talks about and decides which gateway events may move a row where.
 *
 *   trialing ─pay─▶ active ─fail─▶ past_due ─pay─▶ active
 *      │              │               │
 *      │              │cancel         └─grace over / halted─▶ expired
 *      ▼              ▼
 *   expired       cancelled (access until period end) ─period over─▶ expired
 *                     │resume (before period end)
 *                     ▼
 *                   active
 */

export type SubState = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'
export type SubEvent =
  | 'payment_succeeded'
  | 'payment_failed'
  | 'cancel'
  | 'resume'
  | 'period_ended'
  | 'grace_expired'
  | 'gateway_halted'
  | 'refund'

export interface StoredSub {
  status?: string | null
  ends_at?: string | null
  trial_ends_at?: string | null
  trial_order_id?: string | null
  last_order_id?: string | null
  past_due?: boolean | null
  cancel_at_period_end?: boolean | null
}

/** Current state of a stored row. */
export function subState(sub: StoredSub | null | undefined, now: Date = new Date()): SubState {
  if (!sub) return 'expired'
  const end = sub.ends_at ? Date.parse(sub.ends_at) : NaN
  const live = sub.status === 'active' && Number.isFinite(end) && end > now.getTime()
  if (!live) return sub.status === 'cancelled' && Number.isFinite(end) && end > now.getTime() ? 'cancelled' : 'expired'
  if (sub.past_due) return 'past_due'
  if (sub.cancel_at_period_end) return 'cancelled'
  if (sub.trial_ends_at && sub.trial_order_id && sub.trial_order_id === sub.last_order_id) return 'trialing'
  return 'active'
}

/** Does the state grant the plan's entitlements? (past_due keeps access during grace.) */
export function stateHasAccess(s: SubState): boolean {
  return s !== 'expired'
}

const TABLE: Record<SubState, Partial<Record<SubEvent, SubState>>> = {
  trialing: { payment_succeeded: 'active', cancel: 'cancelled', period_ended: 'expired', refund: 'expired' },
  active: { payment_succeeded: 'active', payment_failed: 'past_due', cancel: 'cancelled', period_ended: 'expired', gateway_halted: 'expired', refund: 'expired' },
  past_due: { payment_succeeded: 'active', payment_failed: 'past_due', grace_expired: 'expired', gateway_halted: 'expired', cancel: 'cancelled', refund: 'expired' },
  cancelled: { resume: 'active', period_ended: 'expired', payment_succeeded: 'active', refund: 'expired' },
  expired: { payment_succeeded: 'active' },
}

/** Next state, or null when the event is not allowed in this state (callers ignore it: idempotent replays). */
export function nextSubState(state: SubState, event: SubEvent): SubState | null {
  return TABLE[state][event] ?? null
}

export function canTransition(state: SubState, event: SubEvent): boolean {
  return nextSubState(state, event) !== null
}
