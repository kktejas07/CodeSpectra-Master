'use client'

import * as React from 'react'
import '@/lib/fetch-csrf-guard'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/lib/toast-context'
import { ConfirmProvider } from '@/lib/confirm-context'
import { TourProvider } from '@/components/tour/tour-context'

/**
 * App-wide client providers. Children render on the server too (no mount
 * gate): public pages must ship real HTML for search engines, AI crawlers and
 * link previews (SEO-001). Theme is hydration-safe the next-themes way —
 * `suppressHydrationWarning` on <html> (app/layout.tsx) and theme-dependent
 * widgets wait for their own mount (components/nav-theme-switch.tsx).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <TourProvider>
          <ToastProvider>
            <ConfirmProvider>
              {children}
            </ConfirmProvider>
          </ToastProvider>
        </TourProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
