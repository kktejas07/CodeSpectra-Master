/**
 * Business events (server side) — names, the automation-bus mapping and the
 * whitelisted, non-personal payload fields we keep.
 *
 * The automation bus (lib/automation/events.ts) has no subscribe hook, so its
 * durable outbox (`automation_events`) is mirrored read-only by the analytics
 * tick (mirrorBusEvents in ./server.ts). Every bus event therefore becomes an
 * analytics event without touching the emit sites. Events that never go
 * through the bus (test started, sign-in, copilot use …) call trackServer().
 */

/** Business events only the server may record (client batches using these names are dropped). */
export const SERVER_EVENT_NAMES: ReadonlySet<string> = new Set([
  'signup', 'login', 'test_started', 'test_submitted', 'test_graded', 'purchase', 'payment_failed', 'refund',
  'subscription_changed', 'subscription_ended', 'job_applied', 'stage_moved', 'hired', 'interview_scheduled',
  'interview_completed', 'hackathon_registered', 'certificate_issued', 'checkout_started', 'marketplace_purchase',
  'marketplace_shipped', 'learn_post_published', 'event_subscribed', 'copilot_used', 'score_released',
])

/** automation event type → analytics event name. */
export const BUS_EVENT_MAP: Readonly<Record<string, string>> = {
  'user.created': 'signup',
  'exam.submitted': 'test_submitted',
  'exam.graded': 'test_graded',
  'score.released': 'score_released',
  'payment.succeeded': 'purchase',
  'payment.failed': 'payment_failed',
  'subscription.expired': 'subscription_ended',
  'candidate.applied': 'job_applied',
  'candidate.stage_changed': 'stage_moved',
  'interview.scheduled': 'interview_scheduled',
  'interview.completed': 'interview_completed',
  'hackathon.registered': 'hackathon_registered',
  'certificate.issued': 'certificate_issued',
  'marketplace.checkout.created': 'checkout_started',
  'marketplace.order.paid': 'marketplace_purchase',
  'marketplace.order.shipped': 'marketplace_shipped',
  'learn.post.published': 'learn_post_published',
}

/** Payload fields copied into analytics props (ids, amounts, kinds — never names, emails or free text). */
const KEEP = new Set([
  'exam_id', 'submission_id', 'score', 'max_score', 'percent', 'auto_submitted', 'graded_by',
  'order_id', 'plan_id', 'amount_minor', 'currency', 'provider', 'kind',
  'job_id', 'application_id', 'candidate_id', 'from_stage', 'to_stage', 'to_stage_type', 'status', 'source', 'method',
  'interview_id', 'hackathon_id', 'codeathon_id', 'certificate_id', 'post_id', 'slug', 'checkout_id', 'total_minor', 'seller_ids',
])

export function busProps(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(payload || {})) {
    if (!KEEP.has(k)) continue
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string') out[k] = v.slice(0, 120)
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string').slice(0, 20)
  }
  return out
}

/** The acting user of a bus payload (buyer / candidate account / user). */
export function busUserId(payload: Record<string, unknown> | null | undefined): string | undefined {
  const p = payload || {}
  for (const k of ['user_id', 'buyer_id']) if (typeof p[k] === 'string' && p[k]) return p[k] as string
  return undefined
}

export interface MirroredEvent {
  event: string
  user_id?: string
  tenant_id: string | null
  properties: Record<string, unknown>
  dedupe_key: string
  extra?: MirroredEvent[]
}

/** Pure: one outbox row → analytics event(s) ('stage_moved' to a hired stage also yields 'hired'). */
export function mapBusEvent(ev: { id: string; type: string; payload?: Record<string, unknown>; tenant_id?: string | null }): MirroredEvent[] {
  const name = BUS_EVENT_MAP[ev.type]
  if (!name) return []
  const base: MirroredEvent = { event: name, user_id: busUserId(ev.payload), tenant_id: ev.tenant_id ?? null, properties: busProps(ev.payload), dedupe_key: `bus:${ev.id}` }
  const out = [base]
  if (name === 'stage_moved' && ev.payload?.to_stage_type === 'hired') out.push({ ...base, event: 'hired', dedupe_key: `bus:${ev.id}:hired` })
  return out
}
