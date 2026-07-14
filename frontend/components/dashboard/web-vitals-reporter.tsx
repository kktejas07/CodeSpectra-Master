'use client'

import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { csrfFetch } from '@/lib/csrf-fetch'

/**
 * Sends Core Web Vitals to `POST /api/analytics/web-vitals`.
 * Note: /api/analytics/web-vitals is exempt from CSRF in middleware
 * (next/web-vitals lib cannot add custom headers).
 * Mounted only under `/dashboard` so anonymous traffic is not recorded.
 */
export function WebVitalsReporter() {
  const pathname = usePathname() || ''

  useReportWebVitals((metric) => {
    const payload = {
      route: pathname,
      metricName: metric.name,
      metricValue: metric.value,
      metricRating: 'rating' in metric ? String(metric.rating) : undefined,
      metricId: metric.id,
      navigationType:
        'navigationType' in metric && metric.navigationType
          ? String(metric.navigationType)
          : undefined,
      clientTs: new Date().toISOString(),
    }

    void csrfFetch('/api/analytics/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {})
  })

  return null
}
