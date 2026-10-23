'use client'

/**
 * Bridge to the CodeSpectra Android app (mobile/capacitor: a Capacitor shell
 * that loads this site). In a normal browser every export is a safe no-op,
 * so pages work unchanged.
 *
 * The shell injects `window.Capacitor` (native-bridge.js, document start,
 * our origin only). We don't bundle @capacitor/core: plugins are called
 * through Capacitor.nativePromise / nativeCallback, which is what core
 * itself does on Android.
 *
 * Plugins used: CodeSpectraNative (shell: lockdown, Play Integrity, share,
 * system bars, consent dialog), PushNotifications, BiometricAuthNative,
 * SecureStorage (Android Keystore).
 */
import { csrfFetch } from '@/lib/csrf-fetch'

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  isPluginAvailable?: (name: string) => boolean
  nativePromise?: (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>
  nativeCallback?: (plugin: string, method: string, options: Record<string, unknown>, cb: (data: unknown, err?: unknown) => void) => string
}

function cap(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null
  const c = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return c && typeof c.nativePromise === 'function' ? c : null
}

/** True only inside the Android app shell. */
export function isNativeApp(): boolean {
  const c = cap()
  try {
    return !!c && c.isNativePlatform?.() === true && c.getPlatform?.() === 'android'
  } catch {
    return false
  }
}

export function hasNativePlugin(name: string): boolean {
  const c = cap()
  try {
    return !!c && isNativeApp() && (c.isPluginAvailable ? c.isPluginAvailable(name) : true)
  } catch {
    return false
  }
}

export async function nativeCall<T = unknown>(plugin: string, method: string, options: Record<string, unknown> = {}): Promise<T> {
  const c = cap()
  if (!c?.nativePromise || !isNativeApp()) throw new Error('not_native')
  return (await c.nativePromise(plugin, method, options)) as T
}

/** Subscribe to a plugin event; returns an unsubscribe function. */
export function nativeListen<T = unknown>(plugin: string, eventName: string, cb: (data: T) => void): () => void {
  const c = cap()
  if (!c?.nativeCallback || !isNativeApp()) return () => {}
  let callbackId: string | null = null
  try {
    callbackId = c.nativeCallback(plugin, 'addListener', { eventName }, (data, err) => { if (!err && data) cb(data as T) })
  } catch {
    return () => {}
  }
  return () => {
    if (callbackId) void c.nativePromise?.(plugin, 'removeListener', { eventName, callbackId }).catch(() => {})
    callbackId = null
  }
}

// ── Proctored lockdown ───────────────────────────────────────────────────

export type NativeLockdownEventType =
  | 'app_background' | 'focus_lost' | 'overlay_detected' | 'multi_window' | 'external_display'
  | 'screenshot' | 'screen_recording' | 'lock_task_exit' | 'lock_task_declined' | 'back_blocked'

export interface NativeLockdownEvent {
  type: NativeLockdownEventType
  at: number
  duration_ms?: number
  screens?: number
}

/** The integrity-API event (lib/integrity/types EVENT_TYPES) a native event counts as, if any. */
export type MappedIntegrityEvent = { type: 'tab_hidden' | 'window_blur' | 'fullscreen_exit' | 'multi_monitor'; data?: Record<string, number | boolean> }

/** Pure: native lockdown event → integrity event. Others go to the proctor timeline only. */
export function mapLockdownEvent(e: NativeLockdownEvent): MappedIntegrityEvent | null {
  const dur = typeof e.duration_ms === 'number' && Number.isFinite(e.duration_ms) ? { duration_ms: Math.max(0, Math.round(e.duration_ms)) } : undefined
  switch (e.type) {
    case 'app_background': return { type: 'tab_hidden', data: dur }
    case 'focus_lost': return { type: 'window_blur', data: dur }
    case 'overlay_detected':
    case 'multi_window': return { type: 'window_blur' }
    case 'lock_task_exit':
    case 'lock_task_declined': return { type: 'fullscreen_exit' }
    case 'external_display': return { type: 'multi_monitor', data: { screens: Math.max(2, Math.round(e.screens ?? 2)), extended: true } }
    default: return null
  }
}

/**
 * The page (web) already reports leaving the tab via visibilitychange. In
 * the app that may or may not fire, so a native app_background is dropped
 * when the page saw itself hidden during the same stretch.
 */
let lastHiddenAt = 0
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) lastHiddenAt = Date.now() })
}
export function isDuplicateOfWebHidden(e: NativeLockdownEvent, hiddenAt = lastHiddenAt): boolean {
  if (e.type !== 'app_background' || !hiddenAt) return false
  const start = e.at - (e.duration_ms ?? 0)
  return hiddenAt >= start - 1000 && hiddenAt <= e.at + 1000
}

export interface LockdownHandle { stop: () => Promise<void> }

/**
 * Start lockdown for a proctored attempt (screen pinning, FLAG_SECURE, no
 * overlays, back disabled). Every native event goes to `onEvent` and to the
 * attempt's proctor timeline (/api/proctor/events). Browser: returns null.
 */
export async function startNativeLockdown(opts: {
  sessionKind: 'exam' | 'problem' | 'interview'
  sessionId: string
  locale?: string
  onEvent?: (e: NativeLockdownEvent) => void
}): Promise<LockdownHandle | null> {
  if (!hasNativePlugin('CodeSpectraNative')) return null
  const unlisten = nativeListen<NativeLockdownEvent>('CodeSpectraNative', 'lockdownEvent', (e) => {
    if (!e || typeof e.type !== 'string') return
    try { opts.onEvent?.(e) } catch { /* caller's problem */ }
    void csrfFetch('/api/proctor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_kind: opts.sessionKind,
        session_id: opts.sessionId,
        event_type: `native_${e.type}`,
        meta: { source: 'android', ...(e.duration_ms != null ? { duration_ms: e.duration_ms } : {}), ...(e.screens != null ? { screens: e.screens } : {}) },
      }),
    }).catch(() => {})
  })
  try {
    await nativeCall('CodeSpectraNative', 'startLockdown', { pin: true, locale: opts.locale })
  } catch {
    unlisten()
    return null
  }
  // A fresh device-integrity check for this attempt (signal only).
  void attestDevice({ sessionKind: opts.sessionKind, sessionId: opts.sessionId }).catch(() => {})
  let stopped = false
  return {
    stop: async () => {
      if (stopped) return
      stopped = true
      unlisten()
      await nativeCall('CodeSpectraNative', 'stopLockdown').catch(() => {})
    },
  }
}

// ── Device integrity (Play Integrity) ────────────────────────────────────

export interface DeviceAttestation { trust: 'strong' | 'device' | 'basic' | 'none'; app_recognized: boolean }

export async function attestDevice(ctx: { sessionKind?: 'exam' | 'problem' | 'interview'; sessionId?: string } = {}): Promise<DeviceAttestation | null> {
  if (!hasNativePlugin('CodeSpectraNative')) return null
  const n = await fetch('/api/mobile/integrity', { credentials: 'same-origin' })
  if (!n.ok) return null
  const { nonce } = (await n.json()) as { nonce?: string }
  if (!nonce) return null
  const [{ token }, info] = await Promise.all([
    nativeCall<{ token: string }>('CodeSpectraNative', 'requestIntegrityToken', { nonce }),
    nativeCall<{ packageName: string }>('CodeSpectraNative', 'appInfo'),
  ])
  const r = await csrfFetch('/api/mobile/integrity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, nonce, package_name: info.packageName, session_kind: ctx.sessionKind, session_id: ctx.sessionId }),
  })
  return r.ok ? ((await r.json()) as DeviceAttestation) : null
}

// ── Push (FCM) ───────────────────────────────────────────────────────────

const PUSH_TOKEN_KEY = 'cs-native-push-token'

/** Ask for notification permission and register this device's FCM token with the existing push channel. */
export async function registerNativePush(): Promise<boolean> {
  if (!hasNativePlugin('PushNotifications')) return false
  const perm = await nativeCall<{ receive?: string }>('PushNotifications', 'checkPermissions').catch(() => ({ receive: 'denied' }))
  let receive = perm.receive
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    receive = (await nativeCall<{ receive?: string }>('PushNotifications', 'requestPermissions').catch(() => ({ receive: 'denied' }))).receive
  }
  if (receive !== 'granted') return false
  return new Promise<boolean>((resolve) => {
    let done = false
    const finish = (ok: boolean) => { if (!done) { done = true; offOk(); offErr(); resolve(ok) } }
    const offOk = nativeListen<{ value?: string }>('PushNotifications', 'registration', (t) => {
      const token = t?.value
      if (!token) return finish(false)
      try { localStorage.setItem(PUSH_TOKEN_KEY, token) } catch { /* private mode */ }
      void csrfFetch('/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, platform: 'android' }),
      }).then((r) => finish(r.ok), () => finish(false))
    })
    const offErr = nativeListen('PushNotifications', 'registrationError', () => finish(false))
    nativeCall('PushNotifications', 'register').catch(() => finish(false))
    setTimeout(() => finish(false), 20_000)
  })
}

async function unregisterNativePush(): Promise<void> {
  let token: string | null = null
  try { token = localStorage.getItem(PUSH_TOKEN_KEY); localStorage.removeItem(PUSH_TOKEN_KEY) } catch { /* ignore */ }
  if (token) {
    await csrfFetch('/api/notifications/push-token', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    }).catch(() => {})
  }
  await nativeCall('PushNotifications', 'unregister').catch(() => {})
}

// ── Biometric unlock ─────────────────────────────────────────────────────
// The refresh token lives in Keystore-backed SecureStorage and is read only
// after a successful biometric check. Never the password.

const KEY_PREFIX = 'codespectra_'
const DEVICE_KEY = 'device_id'
const UNLOCK_KEY = 'unlock_token'
const DECLINED_KEY = 'cs-native-bio-declined'

async function secureGet(key: string): Promise<string | null> {
  const r = await nativeCall<{ data?: string | null }>('SecureStorage', 'internalGetItem', { prefixedKey: KEY_PREFIX + key, sync: false }).catch(() => null)
  return typeof r?.data === 'string' && r.data ? r.data : null
}
async function secureSet(key: string, data: string): Promise<void> {
  await nativeCall('SecureStorage', 'internalSetItem', { prefixedKey: KEY_PREFIX + key, data, sync: false })
}
async function secureRemove(key: string): Promise<void> {
  await nativeCall('SecureStorage', 'internalRemoveItem', { prefixedKey: KEY_PREFIX + key, sync: false }).catch(() => {})
}

async function deviceId(): Promise<string> {
  const existing = await secureGet(DEVICE_KEY)
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await secureSet(DEVICE_KEY, id)
  return id
}

async function biometricsAvailable(): Promise<boolean> {
  if (!hasNativePlugin('BiometricAuthNative') || !hasNativePlugin('SecureStorage')) return false
  const r = await nativeCall<{ strongBiometryIsAvailable?: boolean }>('BiometricAuthNative', 'checkBiometry').catch(() => null)
  return r?.strongBiometryIsAvailable === true
}

async function biometricCheck(locale?: string): Promise<boolean> {
  const s = await nativeCall<{ title: string; reason: string; cancel: string }>('CodeSpectraNative', 'biometricPromptStrings', { locale }).catch(() => null)
  try {
    await nativeCall('BiometricAuthNative', 'internalAuthenticate', {
      reason: s?.reason, androidTitle: s?.title, cancelTitle: s?.cancel,
      allowDeviceCredential: false, androidConfirmationRequired: false, androidBiometryStrength: 1, // STRONG
    })
    return true
  } catch {
    return false
  }
}

export async function hasBiometricUnlock(): Promise<boolean> {
  return isNativeApp() && !!(await secureGet(UNLOCK_KEY))
}

/**
 * Signed in, in the app, strong biometrics present, not yet enrolled and not
 * declined: ask once (native dialog in `locale`); on yes, verify the
 * fingerprint / face, then store a device-bound refresh token.
 */
export async function offerBiometricUnlock(locale?: string): Promise<boolean> {
  if (!isNativeApp() || (await hasBiometricUnlock()) || !(await biometricsAvailable())) return false
  try { if (localStorage.getItem(DECLINED_KEY)) return false } catch { /* ignore */ }
  const { accepted } = await nativeCall<{ accepted: boolean }>('CodeSpectraNative', 'confirmBiometricEnroll', { locale }).catch(() => ({ accepted: false }))
  if (!accepted) {
    try { localStorage.setItem(DECLINED_KEY, '1') } catch { /* ignore */ }
    return false
  }
  if (!(await biometricCheck(locale))) return false
  const id = await deviceId()
  const r = await csrfFetch('/api/mobile/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enroll', device_id: id }),
  })
  if (!r.ok) return false
  const { token } = (await r.json()) as { token?: string }
  if (!token) return false
  await secureSet(UNLOCK_KEY, token)
  return true
}

/**
 * Signed out but enrolled: fingerprint / face → exchange the refresh token
 * for a session cookie (rotated). Returns true when signed in.
 */
export async function biometricUnlock(locale?: string): Promise<boolean> {
  if (!isNativeApp()) return false
  const token = await secureGet(UNLOCK_KEY)
  if (!token || !(await biometricCheck(locale))) return false
  const id = await deviceId()
  const r = await csrfFetch('/api/mobile/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlock', device_id: id, token }),
  }).catch(() => null)
  if (!r) return false
  if (r.status === 401) { await secureRemove(UNLOCK_KEY); return false }
  if (!r.ok) return false
  const { token: next } = (await r.json()) as { token?: string }
  if (next) await secureSet(UNLOCK_KEY, next)
  return true
}

// ── System bars, files ───────────────────────────────────────────────────

export async function setNativeSystemBars(dark: boolean, color?: string): Promise<void> {
  if (!hasNativePlugin('CodeSpectraNative')) return
  await nativeCall('CodeSpectraNative', 'setSystemBarTheme', { dark, color }).catch(() => {})
}

/**
 * Save / share a file built in the page (certificate PDF, report). In the
 * app this opens the system share sheet; in a browser it downloads.
 */
export async function saveOrShareBlob(blob: Blob, filename: string): Promise<void> {
  if (hasNativePlugin('CodeSpectraNative')) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsDataURL(blob)
    })
    await nativeCall('CodeSpectraNative', 'shareFile', { base64, filename, mimeType: blob.type || 'application/octet-stream' })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

// ── Sign-out ─────────────────────────────────────────────────────────────

/** Called from lib/pwa/sign-out.ts while the session still exists. */
export async function nativeSignOutCleanup(): Promise<void> {
  if (!isNativeApp()) return
  const id = await secureGet(DEVICE_KEY)
  const token = await secureGet(UNLOCK_KEY)
  await secureRemove(UNLOCK_KEY)
  await Promise.allSettled([
    unregisterNativePush(),
    id ? csrfFetch('/api/mobile/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'revoke', device_id: id, ...(token ? { token } : {}) }),
    }) : Promise.resolve(),
  ])
}
