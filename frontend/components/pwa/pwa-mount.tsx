'use client'

/**
 * App-wide PWA wiring (mounted once in app/layout.tsx; renders only the
 * update banner):
 *  - registers /sw.js in production (lib/pwa/config pwaEnabled)
 *  - "New version available — Refresh" when an updated worker is waiting
 *  - keeps the beforeinstallprompt event for the install card
 *  - relays worker messages (push received, offline queue synced)
 *  - flushes queued offline answers when the connection comes back
 */
import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pwaEnabled, SW_URL } from '@/lib/pwa/config'
import { captureInstallPrompt } from './install-state'
import './pwa.css'

const SHELL_REFRESH_KEY = 'cs-pwa-shell-refreshed'

export function PwaMount() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)

  useEffect(() => captureInstallPrompt(), [])

  useEffect(() => {
    if (!pwaEnabled() || !('serviceWorker' in navigator)) return
    let cancelled = false
    let reloading = false
    const sw = navigator.serviceWorker
    const cleanup: Array<() => void> = []

    const watch = (reg: ServiceWorkerRegistration) => {
      // A worker already waiting from an earlier visit.
      if (reg.waiting && sw.controller) setWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        if (!next) return
        next.addEventListener('statechange', () => {
          // Only an *update* needs a refresh; the first install just takes over.
          if (next.state === 'installed' && sw.controller && !cancelled) setWaiting(next)
        })
      })
    }

    sw.register(SW_URL, { scope: '/', updateViaCache: 'none' })
      .then((reg) => {
        if (cancelled) return
        watch(reg)
        // Re-check for a new worker every hour while the app stays open.
        const t = window.setInterval(() => { reg.update().catch(() => undefined) }, 60 * 60 * 1000)
        cleanup.push(() => window.clearInterval(t))
        refreshShellDaily()
      })
      .catch(() => undefined)

    const onController = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    const onMessage = (e: MessageEvent) => {
      const type = (e.data as { type?: string } | null)?.type
      if (type === 'PUSH_RECEIVED') window.dispatchEvent(new CustomEvent('codespectra:notification'))
      if (type === 'OFFLINE_QUEUE_UPDATED') window.dispatchEvent(new CustomEvent('codespectra:offline-queue'))
    }
    sw.addEventListener('controllerchange', onController)
    sw.addEventListener('message', onMessage)
    return () => {
      cancelled = true
      sw.removeEventListener('controllerchange', onController)
      sw.removeEventListener('message', onMessage)
      cleanup.forEach((f) => f())
    }
  }, [])

  // Queued offline answers go out as soon as we are back online (also without Background Sync).
  useEffect(() => {
    const flush = () => {
      import('@/lib/pwa/offline-store')
        .then(async (m) => { if ((await m.listQueue()).some((q) => q.state !== 'synced' && q.state !== 'rejected')) await m.flushOfflineQueue() })
        .catch(() => undefined)
    }
    window.addEventListener('online', flush)
    if (navigator.onLine) flush()
    return () => window.removeEventListener('online', flush)
  }, [])

  if (!waiting) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="cs-pwa-float fixed left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-card p-3 pl-4 text-sm text-card-foreground shadow-lg"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1">A new version of CodeSpectra is ready.</p>
      <Button size="sm" className="min-h-10 rounded-lg" onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}>
        Refresh
      </Button>
      <button
        type="button"
        onClick={() => setWaiting(null)}
        className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        aria-label="Remind me later"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Keep the offline page's scripts current after deploys (once a day). */
function refreshShellDaily() {
  try {
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(SHELL_REFRESH_KEY) === today || !navigator.onLine) return
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: 'REFRESH_SHELL' })
      localStorage.setItem(SHELL_REFRESH_KEY, today)
    }).catch(() => undefined)
  } catch { /* storage blocked */ }
}
