'use client'

import { useEffect } from 'react'

const HEARTBEAT_MS = 45_000

/**
 * Periodically pings `/api/auth/get-session` so server-side "last seen"
 * tracking can update for the current authenticated user. No-op when not
 * logged in.
 */
export function ActivityHeartbeat() {
  useEffect(() => {
    let cancelled = false
    const ping = async () => {
      if (cancelled) return
      try {
        await fetch('/api/auth/get-session', {
          cache: 'no-store',
          credentials: 'include',
        })
      } catch {
        /* offline / network blip — ignore */
      }
    }
    void ping()
    const id = window.setInterval(() => void ping(), HEARTBEAT_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void ping()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return null
}
