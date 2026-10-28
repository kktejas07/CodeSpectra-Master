'use client'

import { useState, useEffect } from 'react'

export function ClaimCountdown({ claimedAt, onExpire }: { claimedAt: string; onExpire?: () => void }) {
  const [remaining, setRemaining] = useState(() => {
    const expiresAt = new Date(claimedAt).getTime() + 5 * 60 * 1000
    return expiresAt - Date.now()
  })

  useEffect(() => {
    const interval = setInterval(() => {
      const expiresAt = new Date(claimedAt).getTime() + 5 * 60 * 1000
      const r = expiresAt - Date.now()
      setRemaining(r)
      if (r <= 0) { clearInterval(interval); onExpire?.() }
    }, 1000)
    return () => clearInterval(interval)
  }, [claimedAt, onExpire])

  if (remaining <= 0) return <span className="tabular-nums text-red-600 dark:text-red-400">0:00</span>
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
  const urgent = remaining < 60000
  const warning = remaining < 120000
  return (
    <span className={`tabular-nums ${urgent ? 'text-red-600 dark:text-red-400' : warning ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  )
}