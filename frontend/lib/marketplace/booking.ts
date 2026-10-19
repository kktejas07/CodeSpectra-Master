/**
 * Service bookings (buyer part). A slot is held at checkout and booked on payment.
 * Double-booking guard: `active_slot` = "<product>|<start>" is set while a booking is
 * held/booked and removed when it is cancelled; a unique sparse index on it makes the
 * hold atomic (two buyers racing for one slot → exactly one wins).
 */
import 'server-only'
import type { Collection } from 'mongodb'
import { bookingsCol, newId, nowIso, type BookingDoc, type ProductDoc } from './db'
import { generateSlots, isBookableSlot, type ServiceSpec } from './slots'

export interface BookingRow extends BookingDoc {
  active_slot?: string
  reminder_sent_at?: string | null
}

let indexReady: Promise<unknown> | null = null
export async function bookings(): Promise<Collection<BookingRow>> {
  const col = (await bookingsCol()) as unknown as Collection<BookingRow>
  indexReady ??= col.createIndex({ active_slot: 1 }, { unique: true, sparse: true, name: 'mkt_bookings_active_slot' }).catch((e) => {
    indexReady = null
    console.error('[marketplace] booking index failed', e)
  })
  await indexReady
  return col
}

export const slotKey = (productId: string, startIso: string) => `${productId}|${new Date(startIso).toISOString()}`

export function serviceSpec(p: Pick<ProductDoc, 'service'>): ServiceSpec | null {
  const s = p.service
  if (!s || !s.duration_min || !s.timezone) return null
  return { duration_min: s.duration_min, weekly: s.weekly || [], timezone: s.timezone, buffer_min: s.buffer_min }
}

/** Held/booked intervals of this seller in a window (a seller can't be in two sessions at once). */
export async function takenIntervals(sellerId: string, fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> {
  const rows = await (await bookings())
    .find({ seller_id: sellerId, status: { $in: ['held', 'booked'] }, start: { $lt: toIso }, end: { $gt: fromIso } } as never, { projection: { _id: 0, start: 1, end: 1 } })
    .limit(2000).toArray()
  return rows.map((r) => ({ start: r.start, end: r.end }))
}

export async function availableSlots(p: ProductDoc, fromMs: number, toMs: number, now = Date.now()): Promise<string[]> {
  const spec = serviceSpec(p)
  if (!spec) return []
  const span = Math.min(toMs, fromMs + 62 * 86_400_000)
  const taken = await takenIntervals(p.seller_id, new Date(fromMs - 86_400_000).toISOString(), new Date(span + 86_400_000).toISOString())
  return generateSlots(spec, { fromMs, toMs: span, nowMs: now, taken })
}

export async function isSlotAvailable(p: ProductDoc, startIso: string, now = Date.now()): Promise<boolean> {
  const spec = serviceSpec(p)
  if (!spec) return false
  const t = Date.parse(startIso)
  if (!Number.isFinite(t)) return false
  const taken = await takenIntervals(p.seller_id, new Date(t - 86_400_000).toISOString(), new Date(t + 86_400_000).toISOString())
  return isBookableSlot(spec, startIso, { nowMs: now, taken })
}

/** Hold a slot for a pending order. Returns false when someone else holds/booked it. */
export async function holdSlot(input: { product: ProductDoc; startIso: string; orderId: string; lineId: string; buyerId: string }): Promise<boolean> {
  const spec = serviceSpec(input.product)
  if (!spec) return false
  const start = new Date(input.startIso).toISOString()
  const end = new Date(Date.parse(start) + spec.duration_min * 60_000).toISOString()
  const col = await bookings()
  const now = nowIso()
  try {
    await col.insertOne({
      id: newId(), product_id: input.product.id, seller_id: input.product.seller_id, order_id: input.orderId, line_id: input.lineId,
      buyer_id: input.buyerId, start, end, status: 'held', active_slot: slotKey(input.product.id, start), created_at: now, updated_at: now,
    })
    return true
  } catch (e) {
    if ((e as { code?: number })?.code === 11000) return false
    throw e
  }
}

/** Held → booked (idempotent). Returns the booking or null if the hold was lost. */
export async function confirmBooking(orderId: string, lineId: string): Promise<BookingRow | null> {
  const col = await bookings()
  await col.updateOne({ order_id: orderId, line_id: lineId, status: 'held' }, { $set: { status: 'booked', updated_at: nowIso() } })
  return col.findOne({ order_id: orderId, line_id: lineId, status: { $in: ['booked', 'completed'] } } as never, { projection: { _id: 0 } })
}

export async function setBookingMeeting(bookingId: string, m: { join_url: string | null; meeting_id: string | null }) {
  await (await bookings()).updateOne({ id: bookingId }, { $set: { join_url: m.join_url, meeting_id: m.meeting_id, updated_at: nowIso() } })
}

/** Cancel held/booked bookings of an order (or some lines) and free their slots. */
export async function releaseBookings(orderId: string, lineIds?: string[]): Promise<number> {
  const col = await bookings()
  const r = await col.updateMany(
    { order_id: orderId, status: { $in: ['held', 'booked'] }, ...(lineIds ? { line_id: { $in: lineIds } } : {}) } as never,
    { $set: { status: 'cancelled', updated_at: nowIso() }, $unset: { active_slot: '' } },
  )
  return r.modifiedCount
}
