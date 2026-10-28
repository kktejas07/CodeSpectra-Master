'use client'

import * as React from 'react'
import '@/lib/fetch-csrf-guard'
import { config as zodConfig } from 'zod'
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
const INERT_SCRIPT = { type: 'application/json' } as const

// ponytail: zod v4 JIT-compiles schemas via a Function("") probe that trips
// the report-only strict CSP (no unsafe-eval) on every page using validation.
// jitless disables only the eval fast path — same results, ~same speed for
// form-sized schemas. Browser-only: keep server JIT intact.
if (typeof window !== 'undefined') {
  try {
    zodConfig({ jitless: true })
  } catch {
    /* validation still works, JIT probe just reports */
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // scriptProps: next-themes' own pre-hydration <script> is inert (a JSON data
    // block) — it can't carry the CSP nonce, and app/layout.tsx's hashed
    // theme-init script already sets the class + color-scheme before paint.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange scriptProps={INERT_SCRIPT}>
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
