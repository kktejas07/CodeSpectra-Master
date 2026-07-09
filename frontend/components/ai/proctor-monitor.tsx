'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, Camera, Fullscreen, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ProctorMonitorProps {
  sessionKind: 'problem' | 'exam' | 'interview'
  sessionId: string
  enabled?: boolean
  enforceFullscreen?: boolean
  captureInterval?: number
  onEvent?: (eventType: string) => void
  onViolation?: (type: string, count: number) => void
}

export function ProctorMonitor({
  sessionKind,
  sessionId,
  enabled = true,
  enforceFullscreen = false,
  captureInterval = 0,
  onEvent,
  onViolation,
}: ProctorMonitorProps) {
  const [counts, setCounts] = useState({ blur: 0, copy: 0, paste: 0, rclick: 0, idle: 0, fsExit: 0 })
  const [showWarning, setShowWarning] = useState<string | null>(null)
  const [cameraSnapshot, setCameraSnapshot] = useState<string | null>(null)
  const lastInput = useRef<number>(Date.now())
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const send = useCallback((event_type: string, meta?: Record<string, unknown>) => {
    onEvent?.(event_type)
    fetch('/api/proctor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_kind: sessionKind, session_id: sessionId, event_type, meta }),
    }).catch(() => null)
  }, [sessionKind, sessionId, onEvent])

  // Fullscreen enforcement
  useEffect(() => {
    if (!enabled || !enforceFullscreen) return
    const enterFs = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    }
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setCounts((c) => {
          const newCount = c.fsExit + 1
          send('fullscreen_exit')
          if (newCount >= 3) {
            setShowWarning('Multiple fullscreen exits detected. This session may be flagged.')
            onViolation?.('fullscreen_exit', newCount)
          }
          return { ...c, fsExit: newCount }
        })
      }
    }
    enterFs()
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') enterFs()
    })
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [enabled, enforceFullscreen, send, onViolation])

  // Tab blur, copy, paste, right-click detection
  useEffect(() => {
    if (!enabled || !sessionId) return

    const onBlur = () => {
      setCounts((c) => ({ ...c, blur: c.blur + 1 }))
      send('tab_blur')
      if (counts.blur >= 5) {
        onViolation?.('tab_blur', counts.blur + 1)
        setShowWarning('Multiple tab switches detected.')
      }
    }
    const onFocus = () => send('tab_focus')
    const onCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      setCounts((c) => ({ ...c, copy: c.copy + 1 }))
      send('copy', { len: e.clipboardData?.getData('text')?.length ?? 0 })
    }
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      setCounts((c) => ({ ...c, paste: c.paste + 1 }))
      send('paste', { len: e.clipboardData?.getData('text')?.length ?? 0 })
    }
    const onCtx = (e: MouseEvent) => {
      e.preventDefault()
      setCounts((c) => ({ ...c, rclick: c.rclick + 1 }))
      send('right_click', { x: e.clientX, y: e.clientY })
    }
    const onInput = () => { lastInput.current = Date.now() }

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
    window.addEventListener('keydown', onInput)
    window.addEventListener('mousemove', onInput)

    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('contextmenu', onCtx)
      window.removeEventListener('keydown', onInput)
      window.removeEventListener('mousemove', onInput)
      window.clearInterval(idleTimer)
    }
  }, [enabled, sessionId, sessionKind, send, onViolation, counts.blur])

  // Camera capture
  useEffect(() => {
    if (!enabled || captureInterval <= 0) return
    let mounted = true
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
      } catch {
        send('camera_denied')
      }
    }
    startCamera()
    const capTimer = window.setInterval(() => {
      if (!videoRef.current || !mounted) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 320; canvas.height = 240
        const ctx = canvas.getContext('2d')
        if (ctx && videoRef.current) {
          ctx.drawImage(videoRef.current, 0, 0, 320, 240)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5)
          setCameraSnapshot(dataUrl)
          send('camera_capture', { timestamp: Date.now() })
        }
      } catch {} // silent fail on snapshots
    }, captureInterval)
    return () => {
      mounted = false
      window.clearInterval(capTimer)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [enabled, captureInterval, send])

  if (!enabled) return null

  return (
    <>
      {showWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive backdrop-blur shadow-lg">
            <AlertTriangle className="h-4 w-4" />
            {showWarning}
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowWarning(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      <div className="fixed top-3 right-3 z-30 flex items-center gap-2 rounded-md border border-border bg-card/90 backdrop-blur px-2 py-1 text-[10px] uppercase tracking-wide shadow-sm">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Proctored
        </span>
        <span title="Tab blur">T:{counts.blur}</span>
        <span title="Copy events">C:{counts.copy}</span>
        <span title="Fullscreen exits">F:{counts.fsExit}</span>
        {captureInterval > 0 && cameraSnapshot && <Camera className="h-3 w-3 text-green-500" />}
        {enforceFullscreen && <Fullscreen className="h-3 w-3 text-blue-500" />}
      </div>

      <video ref={videoRef} className="hidden" playsInline muted />
    </>
  )
}
