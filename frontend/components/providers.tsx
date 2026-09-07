'use client'

import * as React from 'react'
import '@/lib/fetch-csrf-guard'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/lib/toast-context'
import { ConfirmProvider } from '@/lib/confirm-context'
import { TourProvider } from '@/components/tour/tour-context'
import { TourTooltip } from '@/components/tour/tour-tooltip'

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <TourProvider>
          <ToastProvider>
            <ConfirmProvider>
              {mounted ? (
                <>
                  {children}
                  <TourTooltip />
                </>
              ) : (
                <div className="min-h-screen" />
              )}
            </ConfirmProvider>
          </ToastProvider>
        </TourProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
