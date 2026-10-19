/**
 * Collections:
 *  - subscriptions             SubscriberDoc (unique email / phone / user_id when set)
 *  - subscription_deliveries   DeliveryDoc — one row per (subscriber, type, ref, channel); the
 *                              unique key is what makes every send idempotent. 180-day TTL.
 */
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { DeliveryDoc, SubscriberDoc } from './types'

export { newId, nowIso } from '@/lib/db/ids'

const built = new Map<string, Promise<unknown> | null>()

function lazy<T extends object>(name: string, build: (c: Collection<T>) => Promise<unknown>) {
  return async (): Promise<Collection<T>> => {
    const db: Db = await getMongoDb()
    const col = db.collection<T>(name)
    if (!built.get(name)) {
      built.set(name, build(col).catch((e) => { built.set(name, null); console.error(`[subscriptions] ${name} index`, e) }))
    }
    await built.get(name)
    return col
  }
}

export const subscribersCol = lazy<SubscriberDoc>('subscriptions', (c) =>
  Promise.all([
    c.createIndex({ id: 1 }, { unique: true, name: 'subs_id' }),
    c.createIndex({ email: 1 }, { unique: true, name: 'subs_email', partialFilterExpression: { email: { $type: 'string' } } }),
    c.createIndex({ phone: 1 }, { unique: true, name: 'subs_phone', partialFilterExpression: { phone: { $type: 'string' } } }),
    c.createIndex({ user_id: 1 }, { unique: true, name: 'subs_user', partialFilterExpression: { user_id: { $type: 'string' } } }),
    c.createIndex({ topics: 1, email_status: 1, whatsapp_status: 1 }, { name: 'subs_topic' }),
    c.createIndex({ saved_events: 1 }, { name: 'subs_saved' }),
  ]),
)

type DeliveryRow = DeliveryDoc & { at: Date }
export const deliveriesCol = lazy<DeliveryRow>('subscription_deliveries', (c) =>
  Promise.all([
    c.createIndex({ key: 1 }, { unique: true, name: 'subs_deliv_key' }),
    c.createIndex({ postal_message_id: 1 }, { name: 'subs_deliv_postal', sparse: true }),
    c.createIndex({ created_at: -1 }, { name: 'subs_deliv_recent' }),
    c.createIndex({ at: 1 }, { name: 'subs_deliv_ttl', expireAfterSeconds: 60 * 60 * 24 * 180 }),
  ]),
)

/** Tests only. */
export function __resetSubscriptionIndexes() {
  built.clear()
}
