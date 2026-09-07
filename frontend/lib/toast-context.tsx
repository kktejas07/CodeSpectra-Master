'use client'

import type { ReactNode } from 'react'
import { GooeyToaster, gooeyToast } from 'goey-toast'

/**
 * Single toast system for the entire app — goey-toast
 * (https://goey-toast.vercel.app, gooey morphing toasts built on Sonner).
 *
 * Exactly one `<GooeyToaster />` is mounted here. Call sites keep using the
 * existing `useToast()` hook — `const addToast = useToast()` then
 * `addToast({ type, title, message, duration })` — which now forwards to
 * `gooeyToast`. There is no other/custom toast implementation.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: ReactNode
  duration?: number
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* ponytail: app defaults to dark theme, so the toaster does too */}
      <GooeyToaster position="bottom-right" theme="dark" />
    </>
  )
}

export function useToast() {
  const addToast = (toast: Omit<Toast, 'id'>) => {
    const fn =
      toast.type === 'success'
        ? gooeyToast.success
        : toast.type === 'error'
          ? gooeyToast.error
          : toast.type === 'warning'
            ? gooeyToast.warning
            : toast.type === 'info'
              ? gooeyToast.info
              : gooeyToast
    fn(toast.title, {
      description: toast.message ?? undefined,
      // ponytail: the old custom toaster treated duration 0 as sticky.
      // goey-toast/Sonner has no sticky flag, so 0 maps to ~24h (no
      // setTimeout-overflow risk, effectively never auto-dismisses).
      timing:
        typeof toast.duration === 'number'
          ? { displayDuration: toast.duration === 0 ? 86_400_000 : toast.duration }
          : undefined,
    })
  }
  return addToast
}
