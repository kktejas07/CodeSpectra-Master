'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { readyToaster, registerToasterHost } from '@/lib/toast-bus'
// Static import is fine: AnimatedIcon loads its Lottie player lazily (never in this root chunk).
import { AnimatedIcon } from '@/components/icons/AnimatedIcon'
import { activeLocale } from '@/lib/i18n/client'
import { localizeApiError } from '@/lib/i18n/api-error'
import { loadApiErrors } from '@/lib/i18n/use-api-error'

/**
 * SEO-055: most pages toast the server's English `error` as is. For Hindi /
 * Telugu users a toast text that is a known API error (exact catalog English,
 * lib/i18n/messages/en/apiErrors.json) is shown in their language; anything
 * else stays as given. English never loads the catalogs.
 */
async function localizeToastText<T>(text: T): Promise<T> {
  const locale = activeLocale()
  if (locale === 'en' || typeof text !== 'string' || !text) return text
  try {
    const { table, en } = await loadApiErrors(locale)
    return localizeApiError(locale, { apiErrors: table, apiErrorsEn: en }, { error: text }, text) as T
  } catch {
    return text
  }
}

/**
 * Single toast system for the entire app — goey-toast
 * (https://goey-toast.vercel.app, gooey morphing toasts built on Sonner).
 *
 * SEO-032: goey-toast (framer-motion + sonner) is not in the root bundle: the
 * toaster (components/toast/gooey-toaster.tsx) mounts on the first toast, so
 * pages that never toast never download it.
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

const LazyToaster = dynamic(() => import('@/components/toast/gooey-toaster'), { ssr: false })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false)
  useEffect(() => registerToasterHost(() => setOn(true)), [])
  return (
    <>
      {children}
      {on && <LazyToaster />}
    </>
  )
}

export function useToast() {
  // ponytail: MUST stay referentially stable — 16+ pages list addToast in
  // useEffect deps; a fresh closure per render re-fires their fetch effects
  // forever (settings page hit 1200+ requests → 429 storm). gooeyToast fns
  // are module-singleton refs, so [] deps are safe.
  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    void Promise.all([readyToaster(), localizeToastText(toast.title), localizeToastText(toast.message)]).then(([{ gooeyToast }, title, message]) => {
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
      fn(title, {
        description: message ?? undefined,
        action: toast.action,
        timing: { displayDuration: duration },
        // Success gets the animated check (plays once; still frame under reduced motion).
        ...(toast.type === 'success' ? { icon: <AnimatedIcon name="check-circle" size={18} autoplay hover={false} /> } : {}),
      })
    }).catch(() => { /* toast module failed to load (offline): nothing to show */ })
  }, [])
  return addToast
}
