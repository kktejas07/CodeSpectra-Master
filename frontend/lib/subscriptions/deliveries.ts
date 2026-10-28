/**
 * Delivery ledger. claimDelivery() inserts the unique key BEFORE sending, so a
 * second sweep / replica / retry for the same (subscriber, type, ref, channel)
 * never sends twice. A failed send can be re-claimed up to MAX_ATTEMPTS times.
 */
import { deliveriesCol, nowIso } from './store'
import type { Channel, DeliveryDoc, DeliveryType, Topic } from './types'

export const MAX_ATTEMPTS = 3

export function deliveryKey(subscriberId: string, type: DeliveryType, ref: string, channel: Channel): string {
  return `${subscriberId}:${type}:${ref}:${channel}`
}

export async function claimDelivery(p: { subscriberId: string; type: DeliveryType; ref: string; channel: Channel; topic: Topic | null }): Promise<string | null> {
  const col = await deliveriesCol()
  const key = deliveryKey(p.subscriberId, p.type, p.ref, p.channel)
  const now = nowIso()
  try {
    await col.insertOne({
      key, subscriber_id: p.subscriberId, type: p.type, ref: p.ref, channel: p.channel, topic: p.topic,
      status: 'sending', attempts: 1, error: null, provider_id: null, postal_message_id: null,
      created_at: now, updated_at: now, at: new Date(),
    })
    return key
  } catch (e) {
    if ((e as { code?: number })?.code !== 11000) throw e
  }
  // Already there: only a failed row with attempts left can be retried.
  const retried = await col.findOneAndUpdate(
    { key, status: 'failed', attempts: { $lt: MAX_ATTEMPTS } },
    { $set: { status: 'sending', updated_at: now }, $inc: { attempts: 1 } },
  )
  return retried ? key : null
}

export async function finishDelivery(key: string, r: { ok: boolean; error?: string | null; providerId?: string | null; postalMessageId?: number | null }): Promise<void> {
  const col = await deliveriesCol()
  await col.updateOne({ key }, {
    $set: {
      status: r.ok ? 'sent' : 'failed',
      // Errors can echo addresses back from providers — keep them short and generic.
      error: r.ok ? null : String(r.error || 'send failed').replace(/[^\s@]+@[^\s@]+/g, '[email]').replace(/\+?\d{8,15}/g, '[phone]').slice(0, 300),
      provider_id: r.providerId ?? null,
      postal_message_id: r.postalMessageId ?? null,
      updated_at: nowIso(),
    },
  })
}

export async function listDeliveries(opts: { limit?: number; type?: string; status?: string } = {}): Promise<DeliveryDoc[]> {
  const col = await deliveriesCol()
  const q: Record<string, unknown> = {}
  if (opts.type) q.type = opts.type
  if (opts.status) q.status = opts.status
  const rows = await col.find(q, { projection: { _id: 0, at: 0 } }).sort({ created_at: -1 }).limit(Math.min(500, opts.limit || 100)).toArray()
  return rows as DeliveryDoc[]
}

export async function deliveryStats(sinceIso: string): Promise<Record<string, Record<string, number>>> {
  const col = await deliveriesCol()
  const rows = await col.find({ created_at: { $gte: sinceIso } }, { projection: { _id: 0, type: 1, status: 1 } }).limit(50_000).toArray()
  const out: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    out[r.type] ??= {}
    out[r.type][r.status] = (out[r.type][r.status] || 0) + 1
  }
  return out
}
