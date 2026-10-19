'use client'

import { useEffect, useState } from 'react'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import { ShieldCheck, ExternalLink, RefreshCw, Loader2 } from 'lucide-react'

const MARKER_NAME = 'cspectra-audit'
const CHECK_INTERVAL_MS = 300
const CHECK_TIMEOUT_MS = 3000

interface ExtensionGateProps {
  children: React.ReactNode
  /** If true, skip the gate (for non-strict assessments). */
  bypass?: boolean
  /** Fired once the extension is confirmed present (useful to gate timers). */
  onVerified?: () => void
}

/**
 * Blocks the exam page until the CodeSpectra Device Audit Chrome extension
 * is detected (content script injects <meta name="cspectra-audit">).
 *
 * For `bypass=true` the gate always passes — used for ai_flagged / focus_only
 * where the extension is recommended but not required.
 */
export function ExtensionGate({ children, bypass = false, onVerified }: ExtensionGateProps) {
  const [installed, setInstalled] = useState(bypass)
  const [checking, setChecking] = useState(!bypass)
  const panelRef = useFocusTrap<HTMLDivElement>(!installed)

  useEffect(() => {
    if (bypass) { setInstalled(true); setChecking(false); onVerified?.(); return }

    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += CHECK_INTERVAL_MS
      const found = document.querySelector(`meta[name="${MARKER_NAME}"]`)
      if (found) {
        setInstalled(true)
        setChecking(false)
        onVerified?.()
        clearInterval(timer)
      } else if (elapsed >= CHECK_TIMEOUT_MS) {
        setChecking(false)
        clearInterval(timer)
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [bypass])

  const handleRetry = () => {
    setChecking(true)
    setInstalled(false)
    let elapsed = 0
    const timer = setInterval(() => {
      elapsed += CHECK_INTERVAL_MS
      const found = document.querySelector(`meta[name="${MARKER_NAME}"]`)
      if (found) {
        setInstalled(true)
        setChecking(false)
        onVerified?.()
        clearInterval(timer)
      } else if (elapsed >= CHECK_TIMEOUT_MS) {
        setChecking(false)
        clearInterval(timer)
      }
    }, CHECK_INTERVAL_MS)
  }

  if (installed) return <>{children}</>

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Extension required" className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl dark:shadow-none space-y-5 text-foreground">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Extension required</h2>
            <p className="text-xs text-muted-foreground">Install the Device Audit extension to start this assessment.</p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground space-y-3">
          <p>
            This proctored assessment requires the <strong className="text-foreground">CodeSpectra Device Audit</strong> Chrome extension to verify your hardware setup.
          </p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Detects connected USB devices (pen drives, peripherals)</li>
            <li>Reports real-time hotplug events during the assessment</li>
            <li>Your data stays local — only device types are reported, not file contents</li>
          </ul>
        </div>

        <div className="space-y-3">
          <a
            href="https://chromewebstore.google.com/search/CodeSpectra%20Device%20Audit"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ExternalLink className="h-4 w-4" />
            Install from Chrome Web Store
          </a>

          <div className="flex gap-2">
            <button
              onClick={handleRetry}
              disabled={checking}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {checking ? 'Checking…' : 'I\'ve installed it — check again'}
            </button>
          </div>
        </div>

        <p className="text-[11px] text-center text-muted-foreground">
          After installing, the assessment will detect the extension automatically. You may need to reload this page.
        </p>
      </div>
    </div>
  )
}
