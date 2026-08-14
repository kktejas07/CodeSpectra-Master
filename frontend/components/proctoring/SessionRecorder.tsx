'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { VideoOff } from 'lucide-react'
import { csrfFetch } from '@/lib/csrf-fetch'

interface SessionRecorderProps {
  sessionId: string
  sessionKind: 'exam' | 'problem' | 'interview'
  enabled: boolean
  onConsent?: (consented: boolean) => void
}

const CHUNK_DURATION_MS = 5 * 60 * 1000 // 5 minutes

export function SessionRecorder({ sessionId, sessionKind, enabled }: SessionRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [chunkCount, setChunkCount] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const chunkIdxRef = useRef(0)
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null)

  const uploadChunk = useCallback(async (blob: Blob, index: number, mimeType: string) => {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => {
          const result = reader.result as string
          resolve(result.split(',')[1] || '')
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

      await csrfFetch('/api/proctor/session-recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_kind: sessionKind,
          session_id: sessionId,
          chunk_index: index,
          data: base64,
          mime_type: mimeType,
        }),
      })
    } catch {
      // Recording upload is fire-and-forget — don't break the exam
    }
  }, [sessionKind, sessionId])

  const flushChunks = useCallback(async (mimeType: string) => {
    if (chunksRef.current.length === 0) return
    const batch = [...chunksRef.current]
    chunksRef.current = []
    const blob = new Blob(batch, { type: mimeType })
    const idx = chunkIdxRef.current++
    await uploadChunk(blob, idx, mimeType)
    setChunkCount(idx + 1)
  }, [uploadChunk])

  const startRecording = useCallback(async () => {
    if (recording) return

    try {
      // Get webcam + audio
      const webcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = webcamStream

      // Attempt screen capture — fall back gracefully if denied
      let combinedStream = webcamStream
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        const audioCtx = new AudioContext()
        const dest = audioCtx.createMediaStreamDestination()

        for (const track of webcamStream.getAudioTracks()) {
          audioCtx.createMediaStreamSource(new MediaStream([track])).connect(dest)
        }
        for (const track of screenStream.getAudioTracks()) {
          audioCtx.createMediaStreamSource(new MediaStream([track])).connect(dest)
        }

        combinedStream = new MediaStream([
          ...screenStream.getVideoTracks(),
          ...webcamStream.getVideoTracks(),
          ...dest.stream.getAudioTracks(),
        ])
        screenStream.getAudioTracks().forEach(t => t.stop())
      } catch {
        // Screen capture denied — webcam only
      }

      // Pick best supported mime type
      const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ]
      let mimeType = 'video/webm'
      for (const mt of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mt)) {
          mimeType = mt
          break
        }
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 500_000 })
      recorderRef.current = recorder
      chunksRef.current = []
      chunkIdxRef.current = 0

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        // Flush remaining chunks
        flushChunks(mimeType)
      }

      recorder.start(1000) // emit data every 1s for buffering
      setRecording(true)
      setChunkCount(0)

      // Flush every 5 minutes
      flushTimerRef.current = setInterval(() => {
        if (recorder.state === 'recording') {
          flushChunks(mimeType)
        }
      }, CHUNK_DURATION_MS)
    } catch {
      // Camera denied — can't record
    }
  }, [recording, flushChunks])

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current)
      flushTimerRef.current = null
    }
    setRecording(false)
  }, [])

  // Start when enabled
  useEffect(() => {
    if (enabled && !recording) {
      startRecording()
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop when disabled
  useEffect(() => {
    if (!enabled && recording) {
      stopRecording()
    }
  }, [enabled, recording, stopRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state === 'recording') {
        recorderRef.current.stop()
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
      if (flushTimerRef.current) clearInterval(flushTimerRef.current)
    }
  }, [])

  if (!enabled) return null

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium">
      {recording ? (
        <>
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-red-500">Recording</span>
        </>
      ) : (
        <>
          <VideoOff className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Recording Off</span>
        </>
      )}
    </div>
  )
}
