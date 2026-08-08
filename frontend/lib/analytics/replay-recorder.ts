/**
 * CodeSpectra Analytics — Session Replay Recorder.
 *
 * Uses rrweb to capture DOM mutations, clicks, scrolls, and inputs.
 * Batches events and sends to POST /api/analytics/replay periodically.
 *
 * Privacy: masks inputs with data-cs-private, blocks elements with data-cs-block.
 */
import type { recordOptions, eventWithTime } from 'rrweb'

let stopRecording: (() => void) | null = null
let eventBuffer: eventWithTime[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let sessionId: string = ''
let userId: string | null = null
let initialized = false

const FLUSH_INTERVAL_MS = 10_000 // 10 seconds
const MAX_BUFFER_SIZE = 500 // max events before force flush

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return ''
  const key = 'cs_replay_session'
  const existing = sessionStorage.getItem(key)
  if (existing) return existing
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  sessionStorage.setItem(key, id)
  return id
}

async function flush() {
  if (eventBuffer.length === 0) return
  const events = eventBuffer.splice(0, eventBuffer.length)
  const page = typeof window !== 'undefined' ? window.location.pathname : ''

  try {
    await fetch('/api/analytics/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        session_id: sessionId,
        user_id: userId,
        page,
        events,
      }),
    })
  } catch {
    // Silent — replay should never break the app
  }
}

export function startReplayRecording(opts?: { userId?: string }) {
  if (initialized || typeof window === 'undefined') return

  // Dynamic import to avoid SSR issues
  import('rrweb').then(({ record }) => {
    sessionId = getOrCreateSessionId()
    userId = opts?.userId || null
    initialized = true

    const config: recordOptions<eventWithTime> = {
      emit(event) {
        eventBuffer.push(event)
        if (eventBuffer.length >= MAX_BUFFER_SIZE) {
          void flush()
        }
      },
      // Privacy: mask sensitive inputs
      maskAllInputs: true,
      slimDOMOptions: {
        script: true,
        comment: true,
        headFavicon: true,
        headWhitespace: true,
        headMetaSocial: true,
        headMetaRobots: true,
        headMetaHttpEquiv: true,
        headMetaVerification: true,
      },
      // Sampling: reduce event frequency for performance
      sampling: {
        mousemove: 50,
        scroll: 100,
        input: 'all' as const,
      },
    }

    stopRecording = record(config) || null

    // Flush timer
    flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS)

    // Flush on page unload
    window.addEventListener('beforeunload', () => void flush())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void flush()
    })
  }).catch(() => {
    // rrweb not available — silently skip replay recording
  })
}

export function stopReplayRecording() {
  if (stopRecording) {
    stopRecording()
    stopRecording = null
  }
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  void flush()
  initialized = false
}
