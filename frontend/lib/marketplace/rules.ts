/**
 * Buyer-side eligibility rules — pure (unit tested).
 *
 *  Cancel (no questions asked, refunded at once):
 *    physical  — paid and not yet dispatched (unfulfilled / processing)
 *    service   — booked and the start is at least SERVICE_CANCEL_HOURS away
 *    digital   — never downloaded
 *  Refund / return request:
 *    digital   — only if not downloaded, within hold_days.digital of payment       → auto
 *    service   — before the cutoff (same as cancel)                                → auto
 *    physical  — delivered (or shipped) within hold_days.physical days             → review (return)
 *  Review: verified purchase, after delivery / completion.
 */
import type { FulfilmentStatus, ItemKind, MarketplaceSettings, OrderStatus } from './contract'

export const SERVICE_CANCEL_HOURS = Number(process.env.MKT_SERVICE_CANCEL_HOURS || 24)

export interface RuleLine {
  kind: ItemKind
  fulfilment: { status: FulfilmentStatus; delivered_at?: string; shipped_at?: string; booking?: { start: string; end: string } | null; downloads_used?: number }
  refunded_amount?: number
}
export interface RuleOrder { status: OrderStatus; payment: { status: string; paid_at?: string } }

export type Eligibility = { ok: true; mode: 'auto' | 'review' } | { ok: false; reason: string }

const DAY = 86_400_000
const paid = (o: RuleOrder) => o.payment.status === 'succeeded' || o.payment.status === 'partially_refunded'
const done = (l: RuleLine) => l.fulfilment.status === 'cancelled' || l.fulfilment.status === 'returned' || (l.refunded_amount ?? 0) > 0

export function cancelEligibility(order: RuleOrder, line: RuleLine, now = Date.now(), cancelHours = SERVICE_CANCEL_HOURS): Eligibility {
  if (!paid(order)) return { ok: false, reason: 'This order is not paid.' }
  if (done(line)) return { ok: false, reason: 'This item is already cancelled or refunded.' }
  if (line.kind === 'physical') {
    return line.fulfilment.status === 'unfulfilled' || line.fulfilment.status === 'processing'
      ? { ok: true, mode: 'auto' }
      : { ok: false, reason: 'This item has already been dispatched. Request a return instead.' }
  }
  if (line.kind === 'service') {
    const start = Date.parse(line.fulfilment.booking?.start || '')
    if (line.fulfilment.status !== 'booked' || !Number.isFinite(start)) return { ok: false, reason: 'This session cannot be cancelled now.' }
    return start - now >= cancelHours * 3_600_000
      ? { ok: true, mode: 'auto' }
      : { ok: false, reason: `Sessions can be cancelled up to ${cancelHours} hours before they start.` }
  }
  return (line.fulfilment.downloads_used ?? 0) === 0
    ? { ok: true, mode: 'auto' }
    : { ok: false, reason: 'Downloaded items cannot be cancelled.' }
}

export function refundEligibility(
  order: RuleOrder,
  line: RuleLine,
  settings: Pick<MarketplaceSettings, 'hold_days'>,
  now = Date.now(),
  cancelHours = SERVICE_CANCEL_HOURS,
): Eligibility {
  if (!paid(order)) return { ok: false, reason: 'This order is not paid.' }
  if (done(line)) return { ok: false, reason: 'This item is already cancelled or refunded.' }
  const paidAt = Date.parse(order.payment.paid_at || '')
  if (line.kind === 'digital') {
    if ((line.fulfilment.downloads_used ?? 0) > 0) return { ok: false, reason: 'Downloaded items cannot be refunded.' }
    if (Number.isFinite(paidAt) && now - paidAt > settings.hold_days.digital * DAY) {
      return { ok: false, reason: `Refunds are available for ${settings.hold_days.digital} days after purchase.` }
    }
    return { ok: true, mode: 'auto' }
  }
  if (line.kind === 'service') return cancelEligibility(order, line, now, cancelHours)
  // physical
  if (line.fulfilment.status === 'unfulfilled' || line.fulfilment.status === 'processing') return { ok: true, mode: 'auto' }
  const since = Date.parse(line.fulfilment.delivered_at || line.fulfilment.shipped_at || '')
  if (line.fulfilment.status !== 'delivered' && line.fulfilment.status !== 'shipped') return { ok: false, reason: 'This item cannot be returned.' }
  if (Number.isFinite(since) && now - since > settings.hold_days.physical * DAY) {
    return { ok: false, reason: `Returns are accepted within ${settings.hold_days.physical} days of delivery.` }
  }
  return { ok: true, mode: 'review' }
}

/** Verified purchase, after delivery (physical), download access (digital) or the session ended (service). */
export function canReview(order: RuleOrder, line: RuleLine, now = Date.now()): boolean {
  if (!paid(order) || done(line)) return false
  if (line.kind === 'physical') return line.fulfilment.status === 'delivered'
  if (line.kind === 'digital') return line.fulfilment.status === 'delivered_digital'
  if (line.fulfilment.status === 'completed') return true
  const end = Date.parse(line.fulfilment.booking?.end || '')
  return line.fulfilment.status === 'booked' && Number.isFinite(end) && end <= now
}

/** Reviews with links, e-mail addresses or phone numbers wait for moderation. */
export function needsModeration(text: string): boolean {
  return /(https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\+?\d[\d\s-]{8,}\d)/i.test(text)
}
