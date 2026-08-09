'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { csAnalytics } from '@/lib/analytics'
import { startReplayRecording } from '@/lib/analytics/replay-recorder'

/**
 * Initializes the CodeSpectra Analytics SDK and session replay recorder.
 * Tracks page views on route changes. Mounted once in the dashboard layout.
 */
export function AnalyticsTracker() {
  const pathname = usePathname()

  useEffect(() => {
    csAnalytics.init()
    startReplayRecording()
  }, [])

  useEffect(() => {
    if (pathname) {
      csAnalytics.trackPageView(pathname)
    }
  }, [pathname])

  return null
}
