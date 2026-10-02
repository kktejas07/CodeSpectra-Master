/**
 * Push registration. Reuses the platform's existing notification pipeline:
 * the token is stored in the `push_tokens` collection and fanned out by
 * `notify()` → firebase-admin FCM, so no server-side sender is added.
 *
 * `getDevicePushTokenAsync()` returns the RAW native token — FCM on Android,
 * APNs on iOS. That is exactly what firebase-admin expects, unlike an Expo
 * push token which would need a different sender.
 *
 * Setup requirement (documented, not guessed at): Android needs
 * `google-services.json` from the Firebase project, and iOS needs the APNs
 * key registered with Firebase. Without those, registration fails with an
 * actionable message instead of silently never delivering.
 */
import { Platform } from 'react-native'
import { api } from '../api/client'

export type PushResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'permission' | 'unsupported' | 'not-configured' | 'error'; message: string }

/** Register this device for push and store the token server-side. */
export async function registerForPush(): Promise<PushResult> {
  let Notifications: typeof import('expo-notifications')
  try {
    Notifications = await import('expo-notifications')
  } catch {
    return { ok: false, reason: 'unsupported', message: 'Push module unavailable in this build.' }
  }

  try {
    // Physical device only — simulators/emulators cannot receive push.
    const Device = await import('expo-device').catch(() => null)
    if (Device && Device.isDevice === false) {
      return { ok: false, reason: 'unsupported', message: 'Push requires a physical device.' }
    }

    const existing = await Notifications.getPermissionsAsync()
    let status = existing.status
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync()
      status = asked.status
    }
    if (status !== 'granted') {
      return { ok: false, reason: 'permission', message: 'Notifications are disabled for CodeSpectra.' }
    }

    // Android needs a channel before any notification can display.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'CodeSpectra',
        importance: Notifications.AndroidImportance.DEFAULT,
      })
    }

    const devicePush = await Notifications.getDevicePushTokenAsync()
    const token = String(devicePush.data || '')
    if (token.length < 20) {
      return { ok: false, reason: 'error', message: 'The OS returned no usable push token.' }
    }

    await api.post('/api/notifications/push-token', { token, platform: Platform.OS })
    return { ok: true, token }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // FCM/APNs misconfiguration surfaces here as a native error string.
    if (/FirebaseApp|google-services|APNS|aps-environment|Missing/i.test(msg)) {
      return {
        ok: false,
        reason: 'not-configured',
        message: Platform.OS === 'android'
          ? 'Push needs google-services.json from your Firebase project in mobile/.'
          : 'Push needs the APNs key registered with Firebase for this bundle id.',
      }
    }
    return { ok: false, reason: 'error', message: msg.slice(0, 160) }
  }
}

/** Remove this device's token (called on sign-out). */
export async function unregisterPush(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications')
    const devicePush = await Notifications.getDevicePushTokenAsync()
    const token = String(devicePush.data || '')
    if (token.length >= 20) await api.del('/api/notifications/push-token', { token })
  } catch {
    // Best-effort: a stale token just goes unrenewed.
  }
}
