'use client'

/**
 * Poll with backoff: `fn` runs every `baseMs`; failures back off exponentially
 * (capped at 60 s) and a hidden tab polls 3× slower (lib/live-drives/types
 * nextPollDelay). The control room and the candidate page use it instead of a
 * socket — the app has no WebSocket/SSE transport for app data.
 */
import { useEffect, useRef } from 'react'
import { nextPollDelay } from './types'

export function usePoll(fn: () => Promise<boolean>, baseMs: number, enabled = true): void {
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn }, [fn])
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let failures = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      let ok = false
      try { ok = await ref.current() } catch { ok = false }
      failures = ok ? 0 : failures + 1
      if (stopped) return
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      timer = setTimeout(tick, nextPollDelay(baseMs, failures, { hidden, jitter: (Math.random() - 0.5) * 0.2 }))
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && timer) { clearTimeout(timer); void tick() }
    }
    void tick()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [baseMs, enabled])
}
