'use client'

/**
 * Integrity signals in the candidate's browser — only the ones the author
 * switched on, only after consent (the server also refuses anything else).
 * Events are throttled per type, queued and sent in batches every 10 s (and
 * on page hide). Camera checks run every `face_interval_sec`; a small JPEG
 * is sent only when a camera violation happens and the author enabled
 * snapshots. Typing rhythm keeps key TIMINGS for code answers, never keys.
 *
 * Code inputs opt in to per-question attribution with `data-integrity-q`.
 */
import { useEffect, useRef, useState } from 'react'
import { Camera, ShieldCheck } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { keyClassOf, summariseCadence, type KeySample } from '@/lib/integrity/cadence'
import { frameJpeg, loadFaceWatch, sampleFaces } from '@/lib/integrity/face-watch'
import type { CandidateIntegrityConfig, IntegrityEventType, SignalId, TargetKind } from '@/lib/integrity/types'

interface Props {
  kind: TargetKind
  targetId: string
  config: CandidateIntegrityConfig
  /** Monitoring runs only while true (attempt started / contest live). */
  active: boolean
}

interface QueuedEvent { type: IntegrityEventType; at: number; q?: string | null; data?: Record<string, unknown> }

const FLUSH_MS = 10_000
const TYPING_FLUSH_MS = 30_000
const SAME_TYPE_MS = 3_000
const SNAPSHOT_GAP_MS = 20_000
const CAMERA_REPEAT_MS = 30_000
const AWAY_YAW = 28

function questionOf(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest('[data-integrity-q]') : null
  const q = el?.getAttribute('data-integrity-q') || null
  return q && /^[A-Za-z0-9_-]{1,80}$/.test(q) ? q : null
}

export function IntegrityMonitor({ kind, targetId, config, active }: Props) {
  const on = (s: SignalId) => config.enabled && config.signals.includes(s)
  const queue = useRef<QueuedEvent[]>([])
  const lastByType = useRef<Record<string, number>>({})
  const lastSnap = useRef(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [camera, setCamera] = useState<'off' | 'starting' | 'on' | 'blocked'>('off')
  const signalsKey = config.signals.join(',')

  useEffect(() => {
    if (!active || !config.enabled) return
    let stopped = false
    const target = { target_kind: kind, target_id: targetId }

    const flush = (keepalive = false) => {
      if (!queue.current.length) return
      const events = queue.current.splice(0, 50)
      void csrfFetch('/api/integrity/events', {
        method: 'POST', keepalive, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, events }),
      }).catch(() => { if (!keepalive) queue.current.unshift(...events.slice(0, 50 - queue.current.length)) })
      if (queue.current.length) flush(keepalive)
    }
    const push = (type: IntegrityEventType, data?: Record<string, unknown>, q?: string | null, opts: { throttle?: boolean } = {}) => {
      const now = Date.now()
      if (opts.throttle !== false && now - (lastByType.current[type] ?? 0) < SAME_TYPE_MS) return
      lastByType.current[type] = now
      queue.current.push({ type, at: now, q: q ?? null, data })
      if (queue.current.length >= 20) flush()
    }
    const snapshot = (reason: IntegrityEventType) => {
      if (!config.snapshots || !videoRef.current) return
      const now = Date.now()
      if (now - lastSnap.current < SNAPSHOT_GAP_MS) return
      const image = frameJpeg(videoRef.current)
      if (!image) return
      lastSnap.current = now
      void csrfFetch('/api/integrity/snapshots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, reason, at: now, image }),
      }).catch(() => {})
    }

    if (!config.consented) push('consent_given', { version: 1 }, null, { throttle: false })
    push('session_start', { screen_w: window.screen?.width, screen_h: window.screen?.height }, null, { throttle: false })

    const cleanups: Array<() => void> = []
    const listen = <K extends string>(t: EventTarget, name: K, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(name, fn, opts)
      cleanups.push(() => t.removeEventListener(name, fn, opts))
    }

    // Tab / window focus (with time away).
    if (on('tab_focus')) {
      let hiddenAt = 0
      let blurAt = 0
      listen(document, 'visibilitychange', () => {
        if (document.hidden) hiddenAt = Date.now()
        else if (hiddenAt) { push('tab_hidden', { duration_ms: Date.now() - hiddenAt }, null, { throttle: false }); snapshot('tab_hidden'); hiddenAt = 0 }
      })
      listen(window, 'blur', () => { if (!document.hidden) blurAt = Date.now() })
      listen(window, 'focus', () => {
        if (blurAt && !hiddenAt) push('window_blur', { duration_ms: Date.now() - blurAt })
        blurAt = 0
      })
    }
    // Full screen.
    if (on('fullscreen')) {
      let wasFull = !!document.fullscreenElement
      listen(document, 'fullscreenchange', () => {
        const full = !!document.fullscreenElement
        if (wasFull && !full) { push('fullscreen_exit'); snapshot('fullscreen_exit') }
        wasFull = full
      })
    }
    // Copy / paste: lengths only.
    if (on('clipboard')) {
      listen(document, 'copy', (e) => push('copy', { length: String(window.getSelection?.() ?? '').length }, questionOf(e.target), { throttle: false }), { capture: true })
      listen(document, 'paste', (e) => {
        const text = (e as ClipboardEvent).clipboardData?.getData('text') ?? ''
        push('paste', { length: text.length, lines: text ? text.split('\n').length : 0 }, questionOf(e.target), { throttle: false })
      }, { capture: true })
    }
    // Developer tools (minimal heuristic: a docked panel shrinks the viewport a lot).
    if (on('devtools')) {
      let open = false
      const t = setInterval(() => {
        const dw = window.outerWidth - window.innerWidth
        const dh = window.outerHeight - window.innerHeight
        const now = dw > 200 || dh > 260
        if (now && !open) push('devtools_open', { dw, dh })
        open = now
      }, 5_000)
      cleanups.push(() => clearInterval(t))
    }
    // Extra screens (Window Management API; no permission prompt — isExtended only).
    if (on('multi_monitor')) {
      const scr = window.screen as Screen & { isExtended?: boolean } & EventTarget
      const check = () => { if (scr.isExtended === true) push('multi_monitor', { extended: true }) }
      check()
      if (typeof scr.addEventListener === 'function') listen(scr, 'change', check)
    }
    // Connection drops (the server notes address changes itself).
    if (on('network')) {
      let offAt = 0
      listen(window, 'offline', () => { offAt = Date.now() })
      listen(window, 'online', () => { if (offAt) push('offline', { duration_ms: Date.now() - offAt }, null, { throttle: false }); offAt = 0 })
    }
    // Typing rhythm in code inputs: timings + key class only.
    if (on('typing_cadence')) {
      const buf = new Map<string, KeySample[]>()
      listen(document, 'keydown', (e) => {
        const q = questionOf(e.target)
        if (!q) return
        const l = buf.get(q) ?? []
        if (l.length < 5000) l.push({ t: Date.now(), k: keyClassOf(e as KeyboardEvent) })
        buf.set(q, l)
      }, { capture: true })
      const flushTyping = () => {
        for (const [q, samples] of buf) {
          if (samples.length >= 5) push('typing_summary', { ...summariseCadence(samples) }, q, { throttle: false })
          buf.delete(q)
        }
      }
      const t = setInterval(flushTyping, TYPING_FLUSH_MS)
      cleanups.push(() => { clearInterval(t); flushTyping() })
    }

    // Camera: face count + looking away.
    let stream: MediaStream | null = null
    let faceTimer: ReturnType<typeof setInterval> | null = null
    if (on('face_count') || on('looking_away')) {
      setCamera('starting')
      ;(async () => {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' }, audio: false })
        } catch (err) {
          if (!stopped) { setCamera('blocked'); push('camera_blocked', { reason: (err as Error)?.name === 'NotAllowedError' ? 'denied' : 'unavailable' }) }
          return
        }
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
        const v = videoRef.current
        if (v) { v.srcObject = stream; await v.play().catch(() => {}) }
        setCamera('on')
        if (!(await loadFaceWatch()) || stopped) return
        let none = 0, away = 0, lastNone = 0, lastAway = 0, lastMulti = 0
        faceTimer = setInterval(async () => {
          if (!videoRef.current || document.hidden) return
          const s = await sampleFaces(videoRef.current)
          if (!s) return
          const now = Date.now()
          none = s.count === 0 ? none + 1 : 0
          if (on('face_count') && none >= 2 && now - lastNone > CAMERA_REPEAT_MS) {
            lastNone = now
            push('face_none', { seconds: none * config.face_interval_sec }, null, { throttle: false }); snapshot('face_none')
          }
          if (on('face_count') && s.count > 1 && now - lastMulti > CAMERA_REPEAT_MS) {
            lastMulti = now
            push('face_multiple', { count: s.count }, null, { throttle: false }); snapshot('face_multiple')
          }
          away = s.count >= 1 && s.yaw !== null && Math.abs(s.yaw) > AWAY_YAW ? away + 1 : 0
          if (on('looking_away') && away >= 2 && now - lastAway > CAMERA_REPEAT_MS) {
            lastAway = now
            push('looking_away', { seconds: away * config.face_interval_sec, yaw: s.yaw ?? 0 }, null, { throttle: false }); snapshot('looking_away')
          }
        }, Math.max(5, config.face_interval_sec) * 1000)
      })()
    }

    const timer = setInterval(() => flush(), FLUSH_MS)
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true) }
    listen(document, 'visibilitychange', onHide)
    listen(window, 'pagehide', () => flush(true))

    return () => {
      stopped = true
      cleanups.forEach((fn) => fn())
      clearInterval(timer)
      if (faceTimer) clearInterval(faceTimer)
      stream?.getTracks().forEach((t) => t.stop())
      push('session_end', undefined, null, { throttle: false })
      flush(true)
      setCamera('off')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signalsKey covers config.signals; consent is sent once per mount
  }, [active, config.enabled, config.face_interval_sec, config.snapshots, signalsKey, kind, targetId])

  if (!active || !config.enabled) return null
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-40 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm dark:shadow-none" role="status" aria-live="polite">
      <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span>Integrity checks on</span>
      {camera !== 'off' && (
        <span className="inline-flex items-center gap-1">
          <Camera className="h-3.5 w-3.5" aria-hidden />
          {camera === 'on' ? 'camera' : camera === 'starting' ? 'starting camera' : 'camera unavailable'}
        </span>
      )}
      {/* Hidden: frames are analysed in the browser; nothing is recorded. */}
      <video ref={videoRef} muted playsInline className="hidden" aria-hidden />
    </div>
  )
}
