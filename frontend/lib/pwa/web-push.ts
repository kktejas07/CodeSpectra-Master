/**
 * VAPID web push channel (PWA, docs/pwa.md).
 *
 *  web_push_subscriptions  { id, user_id, endpoint, endpoint_hash, keys, device,
 *                            created_at, updated_at, last_success_at, failures }
 *
 * Keys come from Admin → Settings → Firebase/push (server secrets
 * webpush_vapid_*), falling back to VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT env vars. Never hard-coded. With no keys the channel is off.
 *
 * Called from lib/push-notifications.ts sendPushToUser(), which is reached
 * through lib/notifications-delivery deliverOrDefer() — so quiet hours are
 * already applied there. Preferences (push channel + per-type switch) are
 * checked here. Endpoints answering 404/410 are deleted.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/ids'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import type { PushPayload } from '@/lib/push-notifications'
import { buildWebPushMessage, isGoneStatus, pushAllowed, serializeWebPush } from './push-payload'

export interface WebPushSubscriptionDoc {
  id: string
  user_id: string
  endpoint: string
  endpoint_hash: string
  keys: { p256dh: string; auth: string }
  device: string
  created_at: string
  updated_at: string
  last_success_at?: string | null
  failures?: number
}

/** Devices per user; the oldest subscription is dropped beyond this. */
export const MAX_DEVICES_PER_USER = 10

let indexes: Promise<unknown> | null = null
export async function subscriptionsCol(): Promise<Collection<WebPushSubscriptionDoc>> {
  const col = (await getMongoDb()).collection<WebPushSubscriptionDoc>('web_push_subscriptions')
  if (!indexes) {
    indexes = Promise.all([
      col.createIndex({ endpoint_hash: 1 }, { unique: true, name: 'wps_endpoint' }),
      col.createIndex({ user_id: 1, updated_at: -1 }, { name: 'wps_user' }),
    ]).catch((e) => { indexes = null; console.error('[web-push] index build failed:', (e as Error)?.message) })
  }
  await indexes
  return col
}

export const endpointHash = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex')

export interface VapidConfig { publicKey: string; privateKey: string; subject: string }

export async function getVapidConfig(): Promise<VapidConfig | null> {
  let s: Record<string, string | undefined> = {}
  try { s = (await readServerSecrets()) as Record<string, string | undefined> } catch { s = {} }
  const publicKey = (s.webpush_vapid_public_key || process.env.VAPID_PUBLIC_KEY || '').trim()
  const privateKey = (s.webpush_vapid_private_key || process.env.VAPID_PRIVATE_KEY || '').trim()
  const subject = (s.webpush_vapid_subject || process.env.VAPID_SUBJECT || '').trim()
    || `mailto:support@${new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai').hostname}`
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

/** Short, non-identifying device label from the User-Agent ("Chrome on Android"). */
export function deviceLabel(ua: string | null | undefined): string {
  const u = String(ua || '')
  const os = /iPhone|iPad|iPod/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' : /Mac OS X/.test(u) ? 'macOS' : /Windows/.test(u) ? 'Windows' : /Linux/.test(u) ? 'Linux' : 'device'
  const br = /Edg\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser'
  return `${br} on ${os}`
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, ua: string | null, replaces?: string): Promise<void> {
  const col = await subscriptionsCol()
  const now = nowIso()
  if (replaces && replaces !== sub.endpoint) await col.deleteOne({ endpoint_hash: endpointHash(replaces), user_id: userId })
  const hash = endpointHash(sub.endpoint)
  // Same browser re-subscribing under another account moves to this one (shared devices).
  await col.updateOne(
    { endpoint_hash: hash },
    {
      $set: { user_id: userId, endpoint: sub.endpoint, keys: sub.keys, device: deviceLabel(ua), updated_at: now, failures: 0 },
      $setOnInsert: { id: newId(), endpoint_hash: hash, created_at: now, last_success_at: null },
    },
    { upsert: true },
  )
  const extra = await col.find({ user_id: userId }, { projection: { id: 1 } }).sort({ updated_at: -1 }).skip(MAX_DEVICES_PER_USER).toArray()
  if (extra.length) await col.deleteMany({ id: { $in: extra.map((d) => d.id) } })
}

export async function removeSubscription(userId: string, endpoint: string): Promise<number> {
  const col = await subscriptionsCol()
  const r = await col.deleteOne({ user_id: userId, endpoint_hash: endpointHash(endpoint) })
  return r.deletedCount
}

export async function listDevices(userId: string): Promise<Array<{ id: string; device: string; created_at: string; last_success_at: string | null; endpoint_hash: string }>> {
  const col = await subscriptionsCol()
  const rows = await col.find({ user_id: userId }, { projection: { _id: 0, id: 1, device: 1, created_at: 1, last_success_at: 1, endpoint_hash: 1 } }).sort({ updated_at: -1 }).toArray()
  return rows.map((r) => ({ id: r.id, device: r.device, created_at: r.created_at, last_success_at: r.last_success_at ?? null, endpoint_hash: r.endpoint_hash }))
}

export async function hasWebPushSubscriptions(userId: string): Promise<boolean> {
  try {
    const col = await subscriptionsCol()
    return !!(await col.findOne({ user_id: userId }, { projection: { _id: 1 } }))
  } catch {
    return false
  }
}

/** Push channel + per-type preference check (notification_preferences). */
export async function userAllowsPush(userId: string, type: string | undefined): Promise<boolean> {
  try {
    const prefs = (await getMongoDb()).collection('notification_preferences')
    const [channel, typePref] = await Promise.all([
      prefs.findOne({ user_id: userId, type: 'push' }, { projection: { enabled: 1 } }),
      type ? prefs.findOne({ user_id: userId, type }, { projection: { enabled: 1, push: 1 } }) : Promise.resolve(null),
    ])
    return pushAllowed(channel as { enabled?: unknown } | null, typePref as { enabled?: unknown; push?: unknown } | null)
  } catch (e) {
    console.error('[web-push] preference lookup failed:', (e as Error)?.message)
    return false
  }
}

type WebPushModule = typeof import('web-push')
let wp: WebPushModule | null = null
async function webpush(): Promise<WebPushModule> {
  if (!wp) {
    const m = await import('web-push')
    wp = ((m as unknown as { default?: WebPushModule }).default ?? m) as WebPushModule
  }
  return wp
}

/**
 * Send to every subscribed device of the user. Returns how many devices
 * accepted it. Preferences must be checked by the caller (sendPushToUser).
 */
export async function sendWebPushToUser(userId: string, payload: PushPayload, opts: { notificationId?: string; urgent?: boolean } = {}): Promise<number> {
  const vapid = await getVapidConfig()
  if (!vapid) return 0
  const col = await subscriptionsCol()
  const subs = await col.find({ user_id: userId }).toArray()
  if (subs.length === 0) return 0
  const lib = await webpush()
  const body = serializeWebPush(buildWebPushMessage(payload, { notificationId: opts.notificationId ?? payload.data?.notification_id }))
  let ok = 0
  await Promise.all(subs.map(async (s) => {
    try {
      await lib.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, {
        vapidDetails: vapid,
        TTL: 24 * 60 * 60,
        urgency: opts.urgent ? 'high' : 'normal',
        timeout: 10_000,
      })
      ok++
      await col.updateOne({ id: s.id }, { $set: { last_success_at: nowIso(), failures: 0 } })
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (isGoneStatus(status)) {
        await col.deleteOne({ id: s.id })
      } else {
        // Endpoint URLs identify a device: log only the status.
        console.error('[web-push] send failed:', status ?? (e as Error)?.message)
        await col.updateOne({ id: s.id }, { $inc: { failures: 1 } })
      }
    }
  }))
  return ok
}
