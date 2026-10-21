'use client'

/** Browser side of app (VAPID) push: subscribe / unsubscribe this device. */
import { csrfFetch } from '@/lib/csrf-fetch'
import { SW_URL } from './config'

export interface PushStatus {
  configured: boolean
  publicKey: string | null
  enabled: boolean
  devices: Array<{ id: string; device: string; created_at: string; last_success_at: string | null }>
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iOS only allows web push for apps added to the Home Screen (iOS 16.4+). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** The app worker's registration (null in dev or before it installs). */
export async function appRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/')
  const url = reg?.active?.scriptURL || reg?.installing?.scriptURL || reg?.waiting?.scriptURL || ''
  return url.endsWith(SW_URL) ? reg ?? null : null
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await appRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function fetchPushStatus(): Promise<PushStatus> {
  const res = await fetch('/api/push/subscriptions', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('Could not load push settings')
  return (await res.json()) as PushStatus
}

export async function subscribeThisDevice(publicKey: string): Promise<void> {
  const reg = await appRegistration()
  if (!reg) throw new Error('The app is still installing. Reload the page and try again.')
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site in your browser settings')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  const json = sub.toJSON()
  const res = await csrfFetch('/api/push/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error || 'Could not turn on notifications')
  }
}

export async function unsubscribeThisDevice(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await csrfFetch('/api/push/subscriptions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => null)
  await sub.unsubscribe().catch(() => false)
}

export async function setPushChannel(enabled: boolean): Promise<void> {
  const res = await csrfFetch('/api/push/preference', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
  if (!res.ok) throw new Error('Could not save')
}

export async function sendTestPush(): Promise<boolean> {
  const res = await csrfFetch('/api/push/test', { method: 'POST' })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) throw new Error(j.error || 'Could not send a test notification')
  return !!j.ok
}
