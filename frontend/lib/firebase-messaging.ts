'use client'

/**
 * FCM browser push notifications.
 *
 * Uses the same Firebase app as auth (`@/lib/firebase`). Registers the
 * service worker, requests a push token, saves it to the server, and
 * surfaces foreground messages as a typed callback so the UI can render
 * in-app toasts (XP popups etc.) in real time. All failures degrade to
 * a no-op — push is a nice-to-have on top of the polling notification
 * system, never a hard dependency.
 */
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging'
import { getApp, getApps } from 'firebase/app'
import { getFirebaseAuth, prefetchFirebaseConfig } from '@/lib/firebase'
import { csrfFetch } from '@/lib/csrf-fetch'
import { FCM_SW_SCOPE } from '@/lib/pwa/config'

let _messaging: Messaging | null = null
let _vapidKey = ''

export interface PushMessage {
  title?: string
  body?: string
  link?: string
  messageId?: string
  data: Record<string, string>
}

function getMessagingInstance(): Messaging | null {
  if (_messaging) return _messaging
  try {
    if (getApps().length === 0) return null
    _messaging = getMessaging(getApp())
    return _messaging
  } catch {
    return null
  }
}

/**
 * Initialise messaging + VAPID key. Returns the messaging instance or null
 * when Firebase is not configured (graceful no-op).
 */
export async function initFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return null
  try {
    // Ensure the Firebase app is initialised (auth path does this).
    getFirebaseAuth()
    const messaging = getMessagingInstance()
    if (!messaging) return null
    if (!_vapidKey) {
      const cfg = await prefetchFirebaseConfig()
      _vapidKey = cfg?.vapidKey || ''
    }
    return messaging
  } catch (e) {
    console.warn('[Push] init failed', e)
    return null
  }
}

/**
 * Register (or refresh) the browser push token for the signed-in user.
 * Prompts for notification permission the first time. Returns the token
 * or null when push is unavailable/denied.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  const messaging = await initFirebaseMessaging()
  if (!messaging || typeof Notification === 'undefined') return null
  if (Notification.permission === 'denied') return null
  try {
    if (Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return null
    }
    // Own scope (Firebase's default): scope "/" belongs to the app worker
    // /sw.js (PWA, lib/pwa/config.ts) — registering here at "/" would replace it.
    const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: FCM_SW_SCOPE })
    const pending = reg.installing || reg.waiting
    if (!reg.active && pending) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 5000)
        pending.addEventListener('statechange', () => { if (pending.state === 'activated') { clearTimeout(t); resolve() } })
      })
    }
    // Tell the SW to initialise FCM so background messages get shown.
    if (reg.active) reg.active.postMessage({ type: 'INIT_MESSAGING' })

    const token = await getToken(messaging, { vapidKey: _vapidKey || undefined, serviceWorkerRegistration: reg })
    if (!token) return null

    await csrfFetch('/api/notifications/push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, userId }),
    })
    return token
  } catch (e) {
    console.warn('[Push] register failed', e)
    return null
  }
}

/**
 * Subscribe to foreground push messages. Returns an unsubscribe function.
 * Use `window.dispatchEvent` inside handlers to talk to the rest of the app.
 */
export function onPushMessage(handler: (msg: PushMessage) => void): () => void {
  const messaging = getMessagingInstance()
  if (!messaging) return () => {}
  return onMessage(messaging, (payload) => {
    handler({
      title: payload.notification?.title,
      body: payload.notification?.body,
      messageId: payload.messageId,
      data: payload.data || {},
    })
  })
}
