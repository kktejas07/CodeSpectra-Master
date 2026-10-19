/**
 * Payment settlement for marketplace orders (buyer part).
 *
 *  settlePaid      atomic claim pending_payment|cancelled → paid (only one delivery wins), then
 *                  runPostPayment. Safe to call again and again (webhook retries, the return
 *                  route and the sweep all may call it).
 *  runPostPayment  idempotent steps, each either naturally idempotent (ledger idem keys, status
 *                  guards) or claimed once via an `post.<step>` marker:
 *                    stock/slots commit (re-reserve after a late payment) → recordSale →
 *                    coupon redemption → fulfilment per kind (digital: grant; service: confirm
 *                    booking + meeting; physical: wait for the seller) → cart cleanup →
 *                    e-mails → automatic refund of lines that could not be honoured.
 *  markFailed / abandonOrder   release stock + slots (+ payment-failed e-mail on a real failure).
 *  runBuyerSweep   every few minutes: settle/release expired reservations, booking reminders.
 */
import 'server-only'
import { finalizeCouponRedemption, releaseCouponReservation } from '@/lib/db/billing'
import { notify } from '@/lib/notifications'
import { getMongoDb } from '@/lib/mongodb'
import { nowIso, productsCol, sellersCol } from './db'
import { orders, type OrderDoc, type OrderLineDoc } from './order-doc'
import { fetchGatewayState, isMarketplaceTxn } from './gateways'
import { recordSale } from './ledger'
import { releaseAll, takeOne } from './stock'
import { linePaid } from './pricing'
import { bookings, confirmBooking, holdSlot, releaseBookings, setBookingMeeting } from './booking'
import { removeLinesAfterOrder, lineKey } from './cart'
import { sendBookingConfirmation, sendBookingReminder, sendDownloadReady, sendOrderConfirmation, sendPaymentFailed } from './emails'

export type SettleOutcome = 'paid' | 'already' | 'mismatch' | 'unknown'

/** Claim a one-shot step. True for exactly one caller per order+step. */
async function claimStep(orderId: string, step: string): Promise<boolean> {
  const r = await (await orders()).updateOne({ id: orderId, [`post.${step}`]: { $exists: false } } as never, { $set: { [`post.${step}`]: nowIso() } } as never)
  return r.modifiedCount === 1
}

export async function settlePaid(orderId: string, g: { amount: number; currency: string; txn: string; intent?: string | null }): Promise<SettleOutcome> {
  const col = await orders()
  const order = await col.findOne({ id: orderId }, { projection: { _id: 0 } })
  if (!order) return 'unknown'
  if (order.payment.status === 'succeeded' || order.payment.status === 'refunded' || order.payment.status === 'partially_refunded') {
    await runPostPayment(orderId) // finish any step a crashed delivery left behind
    return 'already'
  }
  if (g.currency.toUpperCase() !== order.currency || !Number.isInteger(g.amount) || g.amount < order.grand_total) {
    console.error('[marketplace] amount/currency mismatch — not settling', { order: order.id, paid: g.amount, expected: order.grand_total })
    return 'mismatch'
  }
  const claim = await col.updateOne(
    { id: orderId, status: { $in: ['pending_payment', 'cancelled'] }, 'payment.status': { $in: ['pending', 'failed'] } } as never,
    { $set: { status: 'paid', 'payment.status': 'succeeded', 'payment.paid_at': nowIso(), 'payment.gateway_txn': g.txn, 'payment.intent': g.intent ?? null, updated_at: nowIso() } },
  )
  if (claim.modifiedCount === 0) {
    await runPostPayment(orderId)
    return 'already'
  }
  await runPostPayment(orderId)
  return 'paid'
}

async function sellerTenant(sellerId: string): Promise<string | null> {
  const s = await (await sellersCol()).findOne({ id: sellerId }, { projection: { user_id: 1 } })
  if (!s?.user_id) return null
  const u = await (await getMongoDb()).collection('user').findOne({ $or: [{ id: s.user_id }, { _id: s.user_id as never }] }, { projection: { tenantId: 1, organizationId: 1 } })
  const t = u?.tenantId ?? u?.organizationId
  return typeof t === 'string' && t ? t : null
}

/** Create the meeting for a booked session via lib/ats/interviews/providers (Zoom / Meet / Teams on the seller's org); manual otherwise. */
async function createMeeting(order: OrderDoc, line: OrderLineDoc, bookingId: string, start: string): Promise<{ join_url: string | null; meeting_id: string | null }> {
  const provider = line.service?.provider
  if (line.service?.mode !== 'virtual' || !provider || !['zoom', 'google_meet', 'teams'].includes(provider)) return { join_url: null, meeting_id: null }
  try {
    const tenantId = await sellerTenant(line.seller_id)
    if (!tenantId) return { join_url: null, meeting_id: null }
    const { getMeetingProvider } = await import('@/lib/ats/interviews/providers')
    const { providerContext } = await import('@/lib/ats/interviews/integrations')
    const p = provider as 'zoom' | 'google_meet' | 'teams'
    const m = await getMeetingProvider(p).createMeeting(providerContext(tenantId, p), {
      interviewId: bookingId, title: line.title, description: `CodeSpectra marketplace order ${order.number}`,
      start, durationMin: line.service.duration_min, timeZone: line.service.timezone || 'UTC', attendees: [{ email: order.buyer_email }],
    })
    return { join_url: m.join_url, meeting_id: m.meeting_id }
  } catch (e) {
    console.error('[marketplace] meeting create failed — seller will add the link', { order: order.id, provider, err: (e as Error)?.message })
    return { join_url: null, meeting_id: null }
  }
}

export async function runPostPayment(orderId: string): Promise<void> {
  const col = await orders()
  let order = await col.findOne({ id: orderId }, { projection: { _id: 0 } })
  if (!order || order.payment.status === 'pending' || order.payment.status === 'failed') return

  // A. Stock + slots. Normal case: the checkout holds become permanent. Late payment after
  //    the holds were released: try to take them again; what can't be honoured is refunded.
  if (order.reservation?.status === 'held') {
    await col.updateOne({ id: orderId, 'reservation.status': 'held' } as never, { $set: { 'reservation.status': 'committed' } } as never)
  } else if (order.reservation?.status === 'released') {
    const claimed = await col.updateOne({ id: orderId, 'reservation.status': 'released' } as never, { $set: { 'reservation.status': 'recommitting' } } as never)
    if (claimed.modifiedCount === 1) {
      const unavailable: string[] = []
      const taken: { product_id: string; variant_id?: string | null; qty: number }[] = []
      const products = await productsCol()
      for (const l of order.lines) {
        if (l.kind === 'physical') {
          const r = await takeOne({ product_id: l.product_id, variant_id: l.variant_id ?? null, qty: l.qty })
          if (r === 'taken') taken.push({ product_id: l.product_id, variant_id: l.variant_id ?? null, qty: l.qty })
          else if (r === null) unavailable.push(l.id)
        } else if (l.kind === 'service' && l.fulfilment.booking) {
          const p = await products.findOne({ id: l.product_id }, { projection: { _id: 0 } })
          const ok = p ? await holdSlot({ product: p, startIso: l.fulfilment.booking.start, orderId, lineId: l.id, buyerId: order.buyer_id }) : false
          if (!ok) unavailable.push(l.id)
        }
      }
      await col.updateOne({ id: orderId }, { $set: { 'reservation.status': 'committed', 'reservation.items': taken, unavailable_line_ids: unavailable, updated_at: nowIso() } })
    }
  }
  order = (await col.findOne({ id: orderId }, { projection: { _id: 0 } }))!

  // B. Ledger (idempotent per order/line inside recordSale).
  await recordSale(order)
  // Automation event (idempotent by key; also stops the abandoned-checkout follow-up).
  const sellerIds = [...new Set(order.lines.map((l) => l.seller_id))]
  const { emit } = await import('@/lib/automation/events')
  void emit('marketplace.order.paid', {
    order_id: order.id, buyer_id: order.buyer_id, buyer_email: order.buyer_email, seller_id: sellerIds[0] ?? null, seller_ids: sellerIds,
    total_minor: order.grand_total, currency: order.currency,
  }, { idempotencyKey: `marketplace.order.paid:${order.id}` })

  // C. Coupon: this order's reservation → redemption. A paid order whose discount can't be
  //    redeemed (its reservation was released and the coupon is used up / used by another order of
  //    this buyer) is not honoured: refunded in full instead of fulfilled with a discount it isn't
  //    entitled to.
  if (order.coupon && (await claimStep(orderId, 'coupon'))) {
    let entitled: boolean
    try {
      entitled = await finalizeCouponRedemption(order.coupon.id, order.buyer_id, order.id, undefined, { strictOrder: true })
    } catch (e) {
      // Let a later run retry the step (webhook retry / sweep).
      await col.updateOne({ id: orderId }, { $unset: { 'post.coupon': '' } } as never)
      throw e
    }
    if (!entitled) {
      console.error('[marketplace] coupon not redeemable for a paid order — refunding', { order: order.id })
      await col.updateOne({ id: orderId }, { $set: { coupon_conflict: true, updated_at: nowIso() } } as never)
    }
  }
  if ((order as OrderDoc & { coupon_conflict?: boolean }).coupon_conflict || (await col.findOne({ id: orderId, coupon_conflict: true } as never, { projection: { _id: 1 } }))) {
    await refundCouponConflict(orderId)
    return
  }

  // D. Fulfilment per kind.
  const skip = new Set(order.unavailable_line_ids || [])
  if (await claimStep(orderId, 'fulfil')) {
    const lines: OrderLineDoc[] = []
    for (const l of order.lines) {
      if (skip.has(l.id) || l.fulfilment.status !== 'unfulfilled') { lines.push(l); continue }
      if (l.kind === 'digital') lines.push({ ...l, fulfilment: { ...l.fulfilment, status: 'delivered_digital', downloads_used: 0 } })
      else if (l.kind === 'service') {
        const b = await confirmBooking(orderId, l.id)
        if (!b) { lines.push(l); skip.add(l.id); continue }
        const m = await createMeeting(order, l, b.id, b.start)
        if (m.join_url) await setBookingMeeting(b.id, m)
        lines.push({ ...l, fulfilment: { ...l.fulfilment, status: 'booked', booking: { start: b.start, end: b.end, join_url: m.join_url ?? undefined, meeting_id: m.meeting_id ?? undefined } } })
      } else lines.push(l) // physical: the seller is notified by recordSale → onSaleRecorded
    }
    await col.updateOne({ id: orderId }, { $set: { lines, ...(skip.size ? { unavailable_line_ids: [...skip] } : {}), updated_at: nowIso() } })
    order = { ...order, lines, unavailable_line_ids: [...skip] }
  }

  // E. Cart cleanup (what was bought leaves the cart).
  if (await claimStep(orderId, 'cart')) {
    await removeLinesAfterOrder(order.buyer_id, order.lines.map((l) => lineKey({ product_id: l.product_id, variant_id: l.variant_id, service_slot: l.kind === 'service' ? l.fulfilment.booking?.start : null }))).catch(() => {})
  }

  // F. Buyer messages (once).
  if (await claimStep(orderId, 'emails')) {
    const ok = order.lines.filter((l) => !skip.has(l.id))
    await sendOrderConfirmation(order)
    const digital = ok.filter((l) => l.kind === 'digital')
    if (digital.length) await sendDownloadReady(order, digital)
    for (const l of ok.filter((x) => x.kind === 'service' && x.fulfilment.booking)) await sendBookingConfirmation(order, l, order.buyer_tz)
    await notify({ user_id: order.buyer_id, type: 'mkt.order_paid', title: `Order ${order.number} confirmed`, message: `${ok.length} item${ok.length === 1 ? '' : 's'} — see your order for downloads, bookings and delivery.`, link: `/dashboard/orders/${order.id}`, icon: 'shopping-bag' }).catch(() => null)
  }

  // G. Lines that could not be honoured after a late payment → refund automatically.
  if (skip.size && (await claimStep(orderId, 'auto_refund'))) {
    const { refundLines } = await import('./orders')
    const ids = [...skip]
    const amount = order.lines.filter((l) => ids.includes(l.id)).reduce((a, l) => a + paidForLine(order!, l), 0)
    await refundLines(order.id, ids, amount, `auto-${order.id}`, { reason: 'unavailable', restock: false }).catch((e) => console.error('[marketplace] auto refund failed', { order: order!.id, err: (e as Error)?.message }))
  }
}

/** Full refund of a paid order that carried a discount it can't redeem; nothing is fulfilled. Idempotent. */
async function refundCouponConflict(orderId: string): Promise<void> {
  const col = await orders()
  const order = await col.findOne({ id: orderId }, { projection: { _id: 0 } })
  if (!order) return
  // Everything not already refunded (a resumed run re-uses what refundLines claimed).
  const open = order.lines.filter((l) => !l.refund_lock && !(l.refunded_amount ?? 0))
  const { refundLines } = await import('./orders')
  if (open.length || order.post?.[`refund_coupon-${orderId}`]) {
    await refundLines(orderId, open.map((l) => l.id), open.reduce((a, l) => a + linePaid(l), 0), `coupon-${orderId}`, { reason: 'coupon_unavailable', restock: true })
  }
  if (await claimStep(orderId, 'coupon_conflict_email')) {
    await notify({ user_id: order.buyer_id, type: 'mkt.refund_processed', title: `Order ${order.number} refunded`, message: 'The coupon on this order had already been used, so the order was cancelled and fully refunded. You can order again without it.', link: `/dashboard/orders/${order.id}`, icon: 'alert-circle' }).catch(() => null)
  }
}

/** What the buyer paid for a line (net + its shipping + tax on top, or tax included). */
export const paidForLine = (_order: Pick<OrderDoc, 'prices_include_tax'>, l: OrderLineDoc): number => linePaid(l)

/** Release reservations of an unpaid order. `failed` (gateway said no) also e-mails the buyer. */
async function release(orderId: string, why: 'failed' | 'expired' | 'replaced' | 'cancelled_by_buyer'): Promise<boolean> {
  const col = await orders()
  const claim = await col.updateOne(
    { id: orderId, status: 'pending_payment', 'reservation.status': 'held' } as never,
    { $set: { status: 'cancelled', 'payment.status': 'failed', 'payment.failure': why, 'reservation.status': 'released', cancelled_reason: why, updated_at: nowIso() } },
  )
  if (claim.modifiedCount === 0) return false
  const order = await col.findOne({ id: orderId }, { projection: { _id: 0 } })
  if (!order) return false
  await releaseAll(order.reservation?.items || [])
  await releaseBookings(orderId)
  // The coupon use reserved for this order goes back (a later new checkout may use it).
  if (order.coupon) await releaseCouponReservation(order.coupon.id, order.buyer_id, orderId).catch((e) => console.error('[marketplace] coupon release failed', (e as Error)?.message))
  if (why === 'failed' && (await claimStep(orderId, 'failed_email'))) {
    await sendPaymentFailed(order)
    await notify({ user_id: order.buyer_id, type: 'mkt.payment_failed', title: 'Payment did not go through', message: `Nothing was charged for order ${order.number}. Your cart is still saved.`, link: '/marketplace/cart', icon: 'alert-circle' }).catch(() => null)
  }
  return true
}

export const markFailed = (orderId: string) => release(orderId, 'failed')
export const abandonOrder = (orderId: string, why: 'expired' | 'replaced' | 'cancelled_by_buyer' = 'expired') => release(orderId, why)

/** PhonePe S2S callback / browser return: settle from the status API only. */
export async function settlePhonePeTxn(txn: string): Promise<'paid' | 'failed' | 'pending' | 'unknown'> {
  if (!isMarketplaceTxn(txn)) return 'unknown'
  const order = await (await orders()).findOne({ 'payment.ref': txn, 'payment.gateway': 'phonepe' } as never, { projection: { _id: 0 } })
  if (!order) return 'unknown'
  if (order.payment.status === 'succeeded') return 'paid'
  const st = await fetchGatewayState(order)
  if (st.state === 'paid') {
    const r = await settlePaid(order.id, { amount: st.amount, currency: st.currency, txn: st.txn })
    return r === 'mismatch' ? 'failed' : 'paid'
  }
  if (st.state === 'failed') { await markFailed(order.id); return 'failed' }
  return 'pending'
}

/** Stripe checkout.session.* for a marketplace session (signature already verified by the caller). */
export async function handleStripeSessionEvent(type: string, session: { id: string; payment_status?: string | null; amount_total?: number | null; currency?: string | null; payment_intent?: string | { id: string } | null }, orderId: string): Promise<void> {
  const order = await (await orders()).findOne({ id: orderId }, { projection: { _id: 0 } })
  if (!order || order.payment.ref !== session.id) {
    console.error('[marketplace] stripe session does not match an order', { order: orderId })
    return
  }
  if ((type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') && session.payment_status === 'paid') {
    const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null
    await settlePaid(orderId, { amount: Number(session.amount_total ?? 0), currency: String(session.currency || ''), txn: intent || session.id, intent })
    return
  }
  if (type === 'checkout.session.async_payment_failed') { await markFailed(orderId); return }
  if (type === 'checkout.session.expired') await abandonOrder(orderId, 'expired')
}

/**
 * Sweep (called from lib/scheduler runAtsMinuteSweeps → /api/cron/tick as well):
 *  - unpaid orders past their reservation: ask the gateway once more (a missed webhook still
 *    settles), otherwise release stock + slots;
 *  - booking reminders ~24 h before a session.
 */
export async function runBuyerSweep(now = new Date()): Promise<{ released: number; settled: number; reminders: number }> {
  const out = { released: 0, settled: 0, reminders: 0 }
  await import('./orders') // registers the refund executor with the admin part (moderation.ts)
  const col = await orders()
  const due = await col.find({ status: 'pending_payment', 'reservation.status': 'held', 'reservation.expires_at': { $lte: now.toISOString() } } as never, { projection: { _id: 0 } }).limit(50).toArray()
  for (const o of due) {
    let state: Awaited<ReturnType<typeof fetchGatewayState>> = { state: 'unknown' }
    try { state = await fetchGatewayState(o) } catch { /* gateway down: release anyway, a late success re-reserves */ }
    if (state.state === 'paid') {
      if ((await settlePaid(o.id, { amount: state.amount, currency: state.currency, txn: state.txn, intent: state.intent })) === 'paid') out.settled++
      continue
    }
    if (await release(o.id, state.state === 'failed' ? 'failed' : 'expired')) out.released++
  }

  const bk = await bookings()
  const soon = await bk.find({ status: 'booked', start: { $gt: now.toISOString(), $lte: new Date(now.getTime() + 24 * 3_600_000).toISOString() }, reminder_sent_at: { $exists: false } } as never, { projection: { _id: 0 } }).limit(100).toArray()
  for (const b of soon) {
    const c = await bk.updateOne({ id: b.id, reminder_sent_at: { $exists: false } } as never, { $set: { reminder_sent_at: now.toISOString() } } as never)
    if (!c.modifiedCount) continue
    const o = await col.findOne({ id: b.order_id }, { projection: { _id: 0, id: 1, number: 1, buyer_email: 1, buyer_id: 1, lines: 1 } })
    if (!o) continue
    const line = o.lines.find((l) => l.id === b.line_id)
    await sendBookingReminder(o.buyer_email, o, line?.title || 'Your session', b.start, b.join_url)
    await notify({ user_id: o.buyer_id, type: 'mkt.booking_reminder', title: 'Session tomorrow', message: `${(line?.title || 'Your session').slice(0, 80)} starts within 24 hours.`, link: `/dashboard/orders/${o.id}`, icon: 'clock' }).catch(() => null)
    out.reminders++
  }
  return out
}

