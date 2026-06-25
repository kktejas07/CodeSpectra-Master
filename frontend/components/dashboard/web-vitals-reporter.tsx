'use client'

import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'

/**
 * Sends Core Web Vitals to `POST /api/analytics/web-vitals` (Supabase `web_vitals_events`).
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

    void fetch('/api/analytics/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    }).catch(() => {})
  })

  return null
}
