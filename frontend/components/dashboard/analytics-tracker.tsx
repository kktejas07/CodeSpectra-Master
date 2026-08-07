'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { csAnalytics } from '@/lib/analytics'

/**
 * Initializes the CodeSpectra Analytics SDK and tracks page views
 * on route changes. Mounted once in the dashboard layout.
 */
export function AnalyticsTracker() {
  const pathname = usePathname()

  useEffect(() => {
    csAnalytics.init()
  }, [])

  useEffect(() => {
    if (pathname) {
      csAnalytics.trackPageView(pathname)
    }
  }, [pathname])

  return null
}
