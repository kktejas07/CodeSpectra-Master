'use client'

/**
 * Android app wiring (mounted once in app/layout.tsx next to PwaMount).
 * Renders nothing and does nothing in a browser.
 *
 * In the app (lib/native-bridge.ts):
 *  - signed in → register the FCM token (once per launch), check device
 *    integrity (once per launch, signal only), and offer biometric unlock once
 *  - signed out but enrolled → fingerprint / face → session restored
 *  - status bar icons follow the site theme
 * Notification taps and App Links are opened by the shell itself.
 */
import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { useAuth } from '@/lib/auth-context'
import { useLocale } from '@/lib/i18n/client'

const UNLOCK_TRIED = 'cs-native-unlock-tried'

export function NativeAppMount() {
  const { user, loading, refreshUser } = useAuth()
  const { resolvedTheme } = useTheme()
  const locale = useLocale()
  const signedInFor = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('@/lib/native-bridge').then(({ isNativeApp, setNativeSystemBars }) => {
      if (cancelled || !isNativeApp()) return
      const dark = resolvedTheme !== 'light'
      void setNativeSystemBars(dark, dark ? '#080D17' : '#F7F9FC')
    })
    return () => { cancelled = true }
  }, [resolvedTheme])

  useEffect(() => {
    if (loading) return
    let cancelled = false
    void import('@/lib/native-bridge').then(async (nb) => {
      if (cancelled || !nb.isNativeApp()) return
      if (user) {
        if (signedInFor.current === user.uid) return
        signedInFor.current = user.uid
        await nb.registerNativePush().catch(() => false)
        void nb.attestDevice().catch(() => null)
        await nb.offerBiometricUnlock(locale).catch(() => false)
        return
      }
      signedInFor.current = null
      // One automatic attempt per app launch; afterwards the user signs in normally.
      try { if (sessionStorage.getItem(UNLOCK_TRIED)) return; sessionStorage.setItem(UNLOCK_TRIED, '1') } catch { /* ignore */ }
      if (await nb.hasBiometricUnlock() && await nb.biometricUnlock(locale)) {
        if (!cancelled) {
          await refreshUser().catch(() => {})
          if (/^\/login(\/|$)/.test(window.location.pathname)) window.location.assign('/dashboard')
        }
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [loading, user, locale, refreshUser])

  return null
}
