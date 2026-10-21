'use client'

/**
 * Sign-out cleanup for the installed app: stop app push on this device
 * (server row removed while the session still exists) and wipe offline
 * practice data. Never blocks sign-out for more than ~1.5 s.
 */
export async function pwaSignOutCleanup(): Promise<void> {
  const work = (async () => {
    const [{ unsubscribeThisDevice }, { clearOfflineData }] = await Promise.all([
      import('./push-client'),
      import('./offline-store'),
    ])
    await Promise.allSettled([unsubscribeThisDevice(), clearOfflineData()])
  })().catch(() => undefined)
  await Promise.race([work, new Promise((r) => setTimeout(r, 1500))])
}
