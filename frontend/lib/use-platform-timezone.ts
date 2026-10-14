'use client'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_TIMEZONE, formatDate, formatDateTime, formatTime, toZonedDateInput } from './format-datetime'

let cached: string | null = null

/** The configured platform timezone (admin Settings → General). Defaults to IST. */
export function usePlatformTimezone(): string {
  const [tz, setTz] = useState(cached || DEFAULT_TIMEZONE)
  useEffect(() => {
    if (cached) return
    fetch('/api/platform/tz', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.timezone && d.timezone !== cached) { cached = d.timezone; setTz(d.timezone) } })
      .catch(() => {})
  }, [])
  return tz
}

/**
 * Timezone-bound formatting helpers for React components. Always render dates
 * through these (or the pure helpers in lib/format-datetime.ts) so the platform
 * timezone setting is reflected on every page and role.
 */
export function useDateFormat() {
  const tz = usePlatformTimezone()
  return useMemo(() => ({
    tz,
    dateTime: (v: string | number | Date | null | undefined, o?: Intl.DateTimeFormatOptions) => formatDateTime(v, tz, o),
    date: (v: string | number | Date | null | undefined, o?: Intl.DateTimeFormatOptions) => formatDate(v, tz, o),
    time: (v: string | number | Date | null | undefined, o?: Intl.DateTimeFormatOptions) => formatTime(v, tz, o),
    /** `YYYY-MM-DD` in the platform tz (date inputs / filters). */
    dateInput: (v: string | number | Date | null | undefined) => toZonedDateInput(v, tz),
    /** Today's `YYYY-MM-DD` in the platform tz. */
    today: () => toZonedDateInput(new Date(), tz),
  }), [tz])
}
