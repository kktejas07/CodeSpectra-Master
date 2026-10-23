'use client'

/**
 * The one mounted <GooeyToaster /> (lib/toast-context.tsx). Loaded with
 * next/dynamic on the first toast only (SEO-032): goey-toast pulls in
 * framer-motion and sonner, which public pages must not ship up front.
 */
import { useEffect } from 'react'
import { GooeyToaster } from 'goey-toast'
import { markToasterMounted } from '@/lib/toast-bus'

export default function GooeyToasterMount() {
  useEffect(() => { markToasterMounted() }, [])
  return (
    <GooeyToaster
      position="top-right"
      // ponytail: app defaults to dark theme, so the toaster does too
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
  )
}
