'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { AlertTriangle, Camera, Fullscreen, ShieldOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { csrfFetch } from '@/lib/csrf-fetch'

interface ProctorMonitorProps {
  sessionKind: 'problem' | 'exam' | 'interview'
  sessionId: string
  enabled?: boolean
  enforceFullscreen?: boolean
  captureInterval?: number
  /** Number of tab switches before forced kickout. 0 = disabled */
  kickoutThreshold?: number
  /** Called when user is kicked out (auto-submit, redirect, etc.) */
  onKickout?: (reason: string) => void
  /** Called on any proctor event */
  onEvent?: (eventType: string) => void
  /** Called when violation threshold is reached */
  onViolation?: (type: string, count: number) => void
}

export function ProctorMonitor({
  sessionKind,
  sessionId,
  enabled = true,
  enforceFullscreen = false,
  captureInterval = 0,
  kickoutThreshold = 5,
  onKickout,
  onEvent,
  onViolation,
}: ProctorMonitorProps) {
  const [counts, setCounts] = useState({ blur: 0, copy: 0, paste: 0, rclick: 0, idle: 0, fsExit: 0 })
  const [showWarning, setShowWarning] = useState<string | null>(null)
  const [cameraSnapshot, setCameraSnapshot] = useState<string | null>(null)
  const [kickedOut, setKickedOut] = useState(false)
  const [awaySeconds, setAwaySeconds] = useState(0)
  const lastInput = useRef<number>(Date.now())
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const kickedRef = useRef(false)

  const send = useCallback((event_type: string, meta?: Record<string, unknown>) => {
    onEvent?.(event_type)
    csrfFetch('/api/proctor/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_kind: sessionKind, session_id: sessionId, event_type, meta }),
    }).catch(() => null)
  }, [sessionKind, sessionId, onEvent])

  const doKickout = useCallback((reason: string) => {
    if (kickedRef.current) return
    kickedRef.current = true
    setKickedOut(true)
    send('session_kickout', { reason })
    onKickout?.(reason)
  }, [send, onKickout])

  // beforeunload — warn when navigating away during a proctored session
  useEffect(() => {
    if (!enabled || !sessionId) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      send('navigate_away_attempt')
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled, sessionId, send])

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

  // Tab blur, copy, paste, right-click detection + kickout
  useEffect(() => {
    if (!enabled || !sessionId) return

    const onBlur = () => {
      if (kickedRef.current) return
      send('tab_blur')
      setCounts((c) => {
        const newCount = c.blur + 1
        if (kickoutThreshold > 0 && newCount >= kickoutThreshold) {
          doKickout('Tab switched too many times')
          return { ...c, blur: newCount }
        }
        if (newCount >= Math.max(1, kickoutThreshold - 2)) {
          const remaining = kickoutThreshold - newCount
          setShowWarning(
            remaining > 0
              ? `Tab switch detected. ${remaining} more switch${remaining > 1 ? 'es' : ''} and you will be removed.`
              : 'Final warning: one more tab switch will remove you from this session.'
          )
        } else if (newCount >= 1) {
          setShowWarning('Tab switch detected. Do not navigate away during the session.')
        }
        onViolation?.('tab_blur', newCount)
        return { ...c, blur: newCount }
      })
    }
    const onFocus = () => {
      send('tab_focus')
      setAwaySeconds(0)
    }
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

    // Track time away from tab — kickout after 60s continuous away
    const awayTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setAwaySeconds(0)
        return
      }
      setAwaySeconds((prev) => {
        const next = prev + 5
        if (next >= 60 && !kickedRef.current) {
          doKickout('Navigated away from tab for too long')
        }
        return next
      })
    }, 5000)

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
      window.clearInterval(awayTimer)
    }
  }, [enabled, sessionId, sessionKind, send, onViolation, kickoutThreshold, doKickout])

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

  // Kickout overlay
  if (kickedOut) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90">
        <div className="text-center space-y-4 p-8">
          <ShieldOff className="h-16 w-16 mx-auto text-red-500" />
          <h2 className="text-2xl font-bold text-white">Session Terminated</h2>
          <p className="text-white/70 max-w-md">
            You have been removed from this session due to repeated tab switches or navigating away.
            Your progress has been saved and reported to the administrator.
          </p>
          <Button variant="destructive" onClick={() => window.location.href = '/dashboard'}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      {showWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive backdrop-blur shadow-lg max-w-lg">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{showWarning}</span>
            <Button size="sm" variant="ghost" className="h-6 text-xs shrink-0" onClick={() => setShowWarning(null)}>
              <X className="h-3 w-3" />
            </Button>
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
