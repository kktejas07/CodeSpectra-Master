'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'

/**
 * Sends Core Web Vitals to `POST /api/analytics/web-vitals`.
 * Note: /api/analytics/web-vitals is exempt from CSRF in middleware
 * (sendBeacon cannot add custom headers).
 * Mounted only under `/dashboard` so anonymous traffic is not recorded.
 *
 * ponytail: was one POST per metric per navigation (~20 calls in minutes on
 * busy pages). Now buffers and flushes every 30s + on pagehide, so a whole
 * session costs a handful of requests instead of dozens.
 */
export function WebVitalsReporter() {
  const pathname = usePathname() || ''
  const pathRef = useRef(pathname)
  pathRef.current = pathname
  const queueRef = useRef<Record<string, unknown>[]>([])

  const flush = () => {
    // Server accepts { events: [...] } with max 24 per request.
    while (queueRef.current.length > 0) {
      const batch = queueRef.current.splice(0, 24)
      try {
        const blob = new Blob([JSON.stringify({ events: batch })], {
          type: 'application/json',
        })
        if (navigator.sendBeacon('/api/analytics/web-vitals', blob)) continue
        throw new Error('beacon rejected')
      } catch {
        // Last resort: single fetch (best-effort, never throws into the app).
        fetch('/api/analytics/web-vitals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: batch }),
          keepalive: true,
        }).catch(() => {})
      }
    }
  }
  const flushRef = useRef(flush)
  flushRef.current = flush

  useReportWebVitals((metric) => {
    queueRef.current.push({
      route: pathRef.current,
      metricName: metric.name,
      metricValue: metric.value,
      metricRating: 'rating' in metric ? String(metric.rating) : undefined,
      metricId: metric.id,
      navigationType:
        'navigationType' in metric && metric.navigationType
          ? String(metric.navigationType)
          : undefined,
      clientTs: new Date().toISOString(),
    })
  })

  useEffect(() => {
    const id = window.setInterval(() => flushRef.current(), 30_000)
    const onHide = () => flushRef.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      flushRef.current()
    }
  }, [])

  return null
}
