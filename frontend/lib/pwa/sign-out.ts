'use client'

/**
 * Sign-out cleanup for the installed app: stop app push on this device
 * (server row removed while the session still exists) and wipe offline
 * practice data. Never blocks sign-out for more than ~1.5 s.
 */
export async function pwaSignOutCleanup(): Promise<void> {
  const work = (async () => {
    const [{ unsubscribeThisDevice }, { clearOfflineData }, { nativeSignOutCleanup }] = await Promise.all([
      import('./push-client'),
      import('./offline-store'),
      import('@/lib/native-bridge'),
    ])
    // Android app: drop its FCM token and the biometric unlock token too.
    await Promise.allSettled([unsubscribeThisDevice(), clearOfflineData(), nativeSignOutCleanup()])
  })().catch(() => undefined)
  await Promise.race([work, new Promise((r) => setTimeout(r, 1500))])
}
