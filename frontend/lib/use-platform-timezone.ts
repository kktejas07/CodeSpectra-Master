'use client'
import { useEffect, useState } from 'react'

let cached: string | null = null

export function usePlatformTimezone(): string {
  const [tz, setTz] = useState(cached || 'Asia/Kolkata')
  useEffect(() => {
    if (cached) return
    fetch('/api/platform/tz', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.timezone && d.timezone !== cached) { cached = d.timezone; setTz(d.timezone) } })
      .catch(() => {})
  }, [])
  return tz
}
