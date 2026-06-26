'use client'

import { useEffect, useRef, useState } from 'react'

interface ProctorMonitorProps {
  sessionKind: 'problem' | 'exam' | 'interview'
  sessionId: string
  enabled?: boolean
  onEvent?: (eventType: string) => void
}

/**
 * Headless AI Proctoring monitor — tracks:
 *  - tab/window blur (focus loss)
 *  - copy / paste
 *  - right-click (context menu)
 *  - fullscreen exit
 *  - extended idleness (no key presses > 60s)
 * Persists each event to /api/proctor/events.
 */
export function ProctorMonitor({
  sessionKind,
  sessionId,
  enabled = true,
  onEvent,
}: ProctorMonitorProps) {
  const [counts, setCounts] = useState({ blur: 0, copy: 0, paste: 0, rclick: 0, idle: 0 })
  const lastInput = useRef<number>(Date.now())

  useEffect(() => {
    if (!enabled || !sessionId) return

    const send = (event_type: string, meta?: Record<string, unknown>) => {
      onEvent?.(event_type)
      fetch('/api/proctor/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_kind: sessionKind, session_id: sessionId, event_type, meta }),
      }).catch(() => null)
    }

    const onBlur = () => {
      setCounts((c) => ({ ...c, blur: c.blur + 1 }))
      send('tab_blur')
    }
    const onFocus = () => send('tab_focus')
    const onCopy = () => {
      setCounts((c) => ({ ...c, copy: c.copy + 1 }))
      send('copy')
    }
    const onPaste = (e: ClipboardEvent) => {
      setCounts((c) => ({ ...c, paste: c.paste + 1 }))
      send('paste', { len: e.clipboardData?.getData('text')?.length ?? 0 })
    }
    const onCtx = (e: MouseEvent) => {
      setCounts((c) => ({ ...c, rclick: c.rclick + 1 }))
      send('right_click', { x: e.clientX, y: e.clientY })
    }
    const onFs = () => {
      if (!document.fullscreenElement) send('fullscreen_exit')
    }
    const onInput = () => {
      lastInput.current = Date.now()
    }
    const idleTimer = window.setInterval(() => {
      const dt = Date.now() - lastInput.current
      if (dt > 60_000) {
        lastInput.current = Date.now()
        setCounts((c) => ({ ...c, idle: c.idle + 1 }))
        send('idle_60s')
      }
    }, 30_000)

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    window.addEventListener('copy', onCopy)
    window.addEventListener('paste', onPaste)
    window.addEventListener('contextmenu', onCtx)
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onInput)
    window.addEventListener('mousemove', onInput)

    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('contextmenu', onCtx)
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onInput)
      window.removeEventListener('mousemove', onInput)
      window.clearInterval(idleTimer)
    }
  }, [enabled, sessionId, sessionKind, onEvent])

  if (!enabled) return null

  return (
    <div
      className="fixed top-3 right-3 z-30 rounded-md border border-border bg-card/90 backdrop-blur px-2 py-1 text-[10px] uppercase tracking-wide flex items-center gap-2 shadow-sm"
      data-testid="proctor-monitor"
    >
      <span className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Proctored
      </span>
      <span title="Tab blur events" data-testid="proctor-blur-count">
        T:{counts.blur}
      </span>
      <span title="Copy events">C:{counts.copy}</span>
      <span title="Paste events">P:{counts.paste}</span>
    </div>
  )
}
