'use client'

/**
 * Proctoring session recorder (audits CORE-011 / CORE-012 / A-004).
 *
 *  - Webcam (+ mic) and screen are recorded by two separate MediaRecorders —
 *    one recorder can only keep one video track, so the old combined stream
 *    silently dropped the webcam whenever the screen was shared.
 *  - Each recorder is restarted every minute, so every uploaded chunk is a
 *    small, self-contained WebM file (stored in object storage / GridFS and
 *    played back as a timeline by staff).
 *  - Uploads send raw bytes, run one at a time per stream and retry with
 *    back-off. A chunk that still fails is reported to the server so the
 *    reviewer sees the gap. The candidate is never interrupted by an upload
 *    problem (only the small "Recording" indicator is shown).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { VideoOff } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { acquireRecordingStream } from '@/lib/proctoring/recording-stream'
import { retryDelayMs, isRetryableStatus, MAX_UPLOAD_TRIES, MAX_QUEUED_CHUNKS } from '@/lib/proctoring/recording-upload'

interface SessionRecorderProps {
  sessionId: string
  sessionKind: 'exam' | 'problem' | 'interview'
  enabled: boolean
  onConsent?: (consented: boolean) => void
}

type StreamName = 'webcam' | 'screen'
interface Pending { stream: StreamName; index: number; startedAt: number; durationMs: number; blob: Blob; mime: string }

const SEGMENT_MS = 60_000
const BITRATE: Record<StreamName, number> = { webcam: 300_000, screen: 500_000 }

function pickMime(withAudio: boolean): string {
  const list = withAudio
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  for (const mt of list) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) return mt
  return 'video/webm'
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function SessionRecorder({ sessionId, sessionKind, enabled }: SessionRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [hasAudio, setHasAudio] = useState(true)
  const activeRef = useRef(false)
  const streamsRef = useRef<Partial<Record<StreamName, MediaStream>>>({})
  const recordersRef = useRef<Partial<Record<StreamName, MediaRecorder>>>({})
  const timersRef = useRef<Partial<Record<StreamName, ReturnType<typeof setTimeout>>>>({})
  const indexRef = useRef<Record<StreamName, number>>({ webcam: 0, screen: 0 })
  const queueRef = useRef<Record<StreamName, Pending[]>>({ webcam: [], screen: [] })
  const drainingRef = useRef<Record<StreamName, boolean>>({ webcam: false, screen: false })
  const hasAudioRef = useRef(true)
  const audioErrorRef = useRef<string | undefined>(undefined)
  const uploads = sessionKind === 'exam' // the server stores recordings per exam attempt

  const reportFailure = useCallback((p: Pick<Pending, 'stream' | 'index'>, reason: string) => {
    if (!uploads) return
    csrfFetch('/api/proctor/session-recording?report=failed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam_id: sessionId, stream: p.stream, chunk: p.index, reason }),
      keepalive: true,
    }).catch(() => { /* nothing else we can do; the gap still shows on the timeline */ })
  }, [sessionId, uploads])

  const uploadOne = useCallback(async (p: Pending): Promise<void> => {
    const qs = new URLSearchParams({
      exam_id: sessionId,
      stream: p.stream,
      chunk: String(p.index),
      started_at: String(p.startedAt),
      duration_ms: String(p.durationMs),
      has_audio: p.stream === 'webcam' && hasAudioRef.current ? '1' : '0',
      ...(p.stream === 'webcam' && audioErrorRef.current ? { audio_error: audioErrorRef.current } : {}),
    })
    let lastReason = 'network'
    for (let attempt = 0; attempt < MAX_UPLOAD_TRIES; attempt++) {
      try {
        const res = await csrfFetch(`/api/proctor/session-recording?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': p.mime },
          body: p.blob,
        })
        if (res.ok) return
        lastReason = `http_${res.status}`
        // Not fixable by retrying. The server already noted a 413 (size cap) itself.
        if (!isRetryableStatus(res.status)) {
          if (res.status !== 413) reportFailure(p, lastReason)
          return
        }
      } catch {
        lastReason = 'network'
      }
      if (attempt < MAX_UPLOAD_TRIES - 1) await sleep(retryDelayMs(attempt))
    }
    reportFailure(p, lastReason)
  }, [sessionId, reportFailure])

  const drain = useCallback(async (stream: StreamName) => {
    if (drainingRef.current[stream]) return
    drainingRef.current[stream] = true
    try {
      while (queueRef.current[stream].length) {
        const next = queueRef.current[stream][0]
        await uploadOne(next)
        queueRef.current[stream].shift()
      }
    } finally {
      drainingRef.current[stream] = false
    }
  }, [uploadOne])

  const enqueue = useCallback((p: Pending) => {
    if (!uploads) return
    const q = queueRef.current[p.stream]
    q.push(p)
    // Bound memory on a dead connection: drop the oldest waiting part (not the one in flight).
    while (q.length > MAX_QUEUED_CHUNKS) {
      const dropped = q.splice(1, 1)[0]
      if (dropped) reportFailure(dropped, 'queue_overflow')
    }
    drain(p.stream)
  }, [drain, reportFailure, uploads])

  /** Record one ~1-minute self-contained segment, then start the next while active. */
  const startSegment = useCallback((name: StreamName, stream: MediaStream, mime: string) => {
    if (!activeRef.current) return
    if (!stream.getVideoTracks().some((t) => t.readyState === 'live')) return
    let rec: MediaRecorder
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: BITRATE[name] })
    } catch {
      return
    }
    const parts: Blob[] = []
    const startedAt = Date.now()
    const index = indexRef.current[name]++
    rec.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data) }
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt
      if (parts.length) enqueue({ stream: name, index, startedAt, durationMs, blob: new Blob(parts, { type: mime }), mime })
      startSegment(name, stream, mime)
    }
    recordersRef.current[name] = rec
    rec.start(5_000)
    timersRef.current[name] = setTimeout(() => { if (rec.state === 'recording') rec.stop() }, SEGMENT_MS)
  }, [enqueue])

  const stopAll = useCallback(() => {
    activeRef.current = false
    for (const name of ['webcam', 'screen'] as StreamName[]) {
      const t = timersRef.current[name]
      if (t) clearTimeout(t)
      const rec = recordersRef.current[name]
      if (rec && rec.state === 'recording') rec.stop() // onstop flushes the last part (and won't restart)
      streamsRef.current[name]?.getTracks().forEach((tr) => tr.stop())
    }
    streamsRef.current = {}
    recordersRef.current = {}
    setRecording(false)
  }, [])

  const start = useCallback(async () => {
    if (activeRef.current) return
    let webcam: MediaStream
    try {
      const acquired = await acquireRecordingStream((c) => navigator.mediaDevices.getUserMedia(c))
      webcam = acquired.stream
      hasAudioRef.current = acquired.hasAudio
      audioErrorRef.current = acquired.audioError
      setHasAudio(acquired.hasAudio)
    } catch {
      return // camera refused — nothing to record
    }
    activeRef.current = true
    streamsRef.current.webcam = webcam
    startSegment('webcam', webcam, pickMime(hasAudioRef.current))
    setRecording(true)

    // Screen is optional: phones and some browsers can't share it, and the candidate may decline.
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('unsupported')
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      if (!activeRef.current) { screen.getTracks().forEach((t) => t.stop()); return }
      streamsRef.current.screen = screen
      startSegment('screen', screen, pickMime(false))
    } catch {
      /* webcam only */
    }
  }, [startSegment])

  useEffect(() => {
    if (enabled && !activeRef.current) start()
    if (!enabled && activeRef.current) stopAll()
  }, [enabled, start, stopAll])

  useEffect(() => () => { if (activeRef.current) stopAll() }, [stopAll])

  if (!enabled) return null

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium">
      {recording ? (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-red-600 dark:text-red-400">Recording{hasAudio ? '' : ' (no audio)'}</span>
        </>
      ) : (
        <>
          <VideoOff className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Recording off</span>
        </>
      )}
    </div>
  )
}
