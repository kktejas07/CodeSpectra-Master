'use client'

import * as React from 'react'
import { ThemeProvider } from '@/components/theme-provider'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/lib/toast-context'
import { ConfirmProvider } from '@/lib/confirm-context'

export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <AuthProvider>
        <ToastProvider>
          <ConfirmProvider>{mounted ? children : <div className="min-h-screen" />}</ConfirmProvider>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
