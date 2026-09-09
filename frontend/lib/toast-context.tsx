'use client'

import { useCallback, type ReactNode } from 'react'
import { GooeyToaster, gooeyToast } from 'goey-toast'

/**
 * Single toast system for the entire app — goey-toast
 * (https://goey-toast.vercel.app, gooey morphing toasts built on Sonner).
 *
 * Exactly one `<GooeyToaster />` is mounted here. Call sites keep using the
 * existing `useToast()` hook — `const addToast = useToast()` then
 * `addToast({ type, title, message, duration, action })` — which now forwards to
 * `gooeyToast`. There is no other/custom toast implementation.
 *
 * Feature map (all live):
 * - position top-right .... toasts stack under the dashboard header, out of
 *                             the content area (was bottom-right)
 * - closeButton ........... per-toast × button
 * - closeOnEscape ......... Esc dismisses the topmost toast
 * - showProgress .......... countdown bar under each toast
 * - showTimestamp ......... "just now / 2m ago" label per toast
 * - maxQueue + drop-oldest  toast-storm guard (see ponytail note below)
 * - per-type durations .... success 4s / info 5s / warning 6s / error 8s
 *                             (explicit `duration` overrides; 0 = sticky)
 * - action ................ optional { label, onClick, successLabel? } button,
 *                             e.g. Retry / View / Copy on the relevant pages
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
  successLabel?: string
}

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: ReactNode
  duration?: number
  action?: ToastAction
}

// ponytail: read-time defaults per severity — errors carry the reason and
// need longer on screen; success is a glance. Explicit `duration` on the
// call site always wins; 0 stays sticky (see mapping below).
const TYPE_DURATIONS: Record<ToastType, number> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 8000,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      {/* ponytail: app defaults to dark theme, so the toaster does too */}
      <GooeyToaster
        position="top-right"
        theme="dark"
        closeButton
        closeOnEscape
        showProgress
        showTimestamp
        // ponytail: storm ceiling — burst toasts (retry loops, bulk actions)
        // evict oldest-first instead of stacking off-screen unbounded.
        maxQueue={5}
        queueOverflow="drop-oldest"
      />
    </>
  )
}

export function useToast() {
  // ponytail: MUST stay referentially stable — 16+ pages list addToast in
  // useEffect deps; a fresh closure per render re-fires their fetch effects
  // forever (settings page hit 1200+ requests → 429 storm). gooeyToast fns
  // are module-singleton refs, so [] deps are safe.
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
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
    // ponytail: explicit duration wins; otherwise the per-severity default.
    // 0 = sticky (mapped to ~24h: no setTimeout-overflow risk, effectively
    // never auto-dismisses — the old custom toaster's sticky contract).
    const duration =
      typeof toast.duration === 'number'
        ? toast.duration === 0
          ? 86_400_000
          : toast.duration
        : TYPE_DURATIONS[toast.type] ?? 5000
    fn(toast.title, {
      description: toast.message ?? undefined,
      action: toast.action,
      timing: { displayDuration: duration },
    })
  }, [])
  return addToast
}
