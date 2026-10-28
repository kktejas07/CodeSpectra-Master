/**
 * Server-side FCM push sender. Reads the user's saved push tokens and fans out
 * a multicast web push notification via firebase-admin. Degrades to a no-op
 * when Firebase Admin is not configured (FCM is best-effort on top of the
 * in-app notification + polling system).
 */
import { getMongoDb } from '@/lib/mongodb'

export interface PushPayload {
  title: string
  body?: string
  link?: string
  data?: Record<string, string>
}

export async function getPushTokens(userId: string, opts: { nativeOnly?: boolean } = {}): Promise<string[]> {
  try {
    const db = await getMongoDb()
    const docs = await db
      .collection('push_tokens')
      .find(opts.nativeOnly ? { user_id: userId, platform: { $in: ['ios', 'android'] } } : { user_id: userId })
      .project({ token: 1, _id: 0 })
      .toArray()
    return docs.map((d) => String(d.token)).filter((t) => t.length >= 20)
  } catch (e) {
    console.error('[push] getPushTokens failed:', e)
    return []
  }
}

export async function removePushToken(token: string): Promise<void> {
  try {
    const db = await getMongoDb()
    await db.collection('push_tokens').deleteMany({ token })
  } catch (e) {
    console.error('[push] removePushToken failed:', e)
  }
}

/**
 * Send a web push notification to a user's registered devices. Returns true
 * if at least one device was targeted, false when unavailable/error.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<boolean> {
  // PWA web push (VAPID) channel + preferences (push channel / per-type switch).
  // Quiet hours were applied before we got here (lib/notifications-delivery).
  // When the user has app (VAPID) subscriptions, FCM goes to native app tokens
  // only, so one browser never shows the same notification twice.
  let webSent = 0
  let hasAppPush = false
  try {
    const wp = await import('@/lib/pwa/web-push')
    if (!(await wp.userAllowsPush(userId, payload.data?.type))) return false
    hasAppPush = await wp.hasWebPushSubscriptions(userId)
    if (hasAppPush) webSent = await wp.sendWebPushToUser(userId, payload)
  } catch (e) {
    console.error('[push] web push failed:', (e as Error)?.message)
  }
  const fcmSent = await sendFcmToUser(userId, payload, hasAppPush)
  return webSent > 0 || fcmSent
}

async function sendFcmToUser(userId: string, payload: PushPayload, nativeOnly: boolean): Promise<boolean> {
  try {
    const tokens = await getPushTokens(userId, { nativeOnly })
    if (tokens.length === 0) return false

    const { adminAuth } = await import('@/lib/firebase-admin')
    const auth = await adminAuth()
    if (!auth) return false

    const { getMessaging } = await import('firebase-admin/messaging')
    const messaging = getMessaging()
    const link = payload.link || '/dashboard'

    await messaging.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body || '' },
      data: { ...(payload.data || {}), link },
      webpush: {
        fcmOptions: { link },
      },
      // iOS app: FCM relays to APNs (APNs key uploaded in Firebase). Default
      // sound; the tap opens data.link (lib/native-bridge registerNativePush).
      apns: { payload: { aps: { sound: 'default' } } },
    })
    return true
  } catch (e) {
    console.error('[push] send failed:', e)
    return false
  }
}
