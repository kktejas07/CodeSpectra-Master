/**
 * Stable entry point for features that want their events to be workflow
 * triggers — including product analytics (lib/analytics) later on.
 *
 *   import { emitAutomationEvent, analyticsEventType } from '@/lib/automation/emit'
 *
 *   // a catalog event (lib/automation/event-types.ts)
 *   await emitAutomationEvent('marketplace.order.paid', { order_id, buyer_id }, { idempotencyKey: `paid:${order_id}` })
 *
 *   // a product-analytics event: `analytics.<name>`
 *   await emitAutomationEvent(analyticsEventType('Checkout Started'), { user_id, properties }, { idempotencyKey: eventId })
 *
 * Guarantees (this signature is kept stable):
 *   - never throws, never blocks on workflow dispatch;
 *   - the same idempotencyKey twice = one event;
 *   - the organisation is resolved from payload.user_id / buyer_id when
 *     `tenantId` is omitted (pass null for "no organisation");
 *   - `analytics.*` events are only stored while at least one active workflow
 *     triggers on that exact type, so high-volume tracking costs nothing until
 *     someone builds a workflow on it. A platform workflow can trigger on
 *     `analytics.<name>` (set it as the event type in the JSON tab).
 * Keep payloads small and free of secrets; they are size-capped and stored.
 */
import { emit, type EmitOptions } from './events'
import { ANALYTICS_EVENT_PREFIX, isAnalyticsEventType, isEmittableEventType } from './event-types'

export type { EmitOptions }
export { isAnalyticsEventType, isEmittableEventType }

/** `Checkout Started` → `analytics.checkout_started` (pure). */
export function analyticsEventType(name: string): string {
  const slug = String(name || '').toLowerCase().trim().replace(/[^a-z0-9_.-]+/g, '_').replace(/^[^a-z0-9]+/, '').replace(/_+$/, '').slice(0, 63)
  return `${ANALYTICS_EVENT_PREFIX}${slug || 'event'}`
}

export async function emitAutomationEvent(type: string, payload: Record<string, unknown>, opts: EmitOptions = {}): Promise<{ id: string | null; duplicate: boolean }> {
  return emit(type, payload && typeof payload === 'object' ? payload : {}, opts)
}
