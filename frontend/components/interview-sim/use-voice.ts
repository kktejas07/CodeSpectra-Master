'use client'

/**
 * Voice I/O for the mock interviewer (browser only).
 *
 *  speak()   browser speech synthesis in the interview language (no third-party audio).
 *  listen    browser speech recognition when the browser has it; otherwise the
 *            answer is recorded (MediaRecorder, audio only) and sent to the
 *            server transcriber (Deepgram) when it is configured.
 *  neither   `supported` is false and the page falls back to typing.
 *
 * The mic is opened only after the learner accepted the consent notice and
 * pressed "Answer by voice"; it is released as soon as the answer stops.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { csrfFetch } from '@/lib/csrf-fetch'
import { useT } from '@/lib/i18n/client'

interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function recognitionCtor(): (new () => RecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition || w.webkitSpeechRecognition || null) as (new () => RecognitionLike) | null
}

function audioMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* keep looking */ }
  }
  return ''
}

export type VoicePhase = 'idle' | 'listening' | 'transcribing'

export function useInterviewVoice(opts: { sessionId: string; language: string; serverTranscription: boolean }) {
  const { t } = useT()
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const recRef = useRef<RecognitionLike | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAt = useRef(0)
  const finalText = useRef('')
  const durationRef = useRef(0)

  const [caps, setCaps] = useState({ browserStt: false, serverStt: false, tts: false })
  useEffect(() => {
    setCaps({
      browserStt: !!recognitionCtor(),
      serverStt: opts.serverTranscription && !!audioMime() && !!navigator.mediaDevices?.getUserMedia,
      tts: typeof window !== 'undefined' && 'speechSynthesis' in window,
    })
  }, [opts.serverTranscription])
  const supported = caps.browserStt || caps.serverStt

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
    recRef.current?.abort()
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
    releaseMic()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  const speak = useCallback((text: string) => {
    if (!caps.tts || !text) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = opts.language
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang === opts.language) || window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(opts.language.split('-')[0]))
      if (voice) u.voice = voice
      u.rate = 1
      u.onstart = () => setSpeaking(true)
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(u)
    } catch {
      setSpeaking(false)
    }
  }, [caps.tts, opts.language])

  const stopSpeaking = useCallback(() => {
    if (caps.tts) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [caps.tts])

  const start = useCallback(async () => {
    setError(null)
    setTranscript('')
    finalText.current = ''
    stopSpeaking()
    const Ctor = recognitionCtor()
    if (Ctor) {
      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = true
      rec.lang = opts.language
      rec.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalText.current += `${r[0].transcript} `
          else interim += r[0].transcript
        }
        setTranscript(`${finalText.current}${interim}`.trim())
      }
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? t('errors.micBlocked')
          : t('errors.sttStopped'))
      }
      rec.onend = () => {
        durationRef.current = Date.now() - startedAt.current
        setPhase('idle')
      }
      recRef.current = rec
      startedAt.current = Date.now()
      try {
        rec.start()
        setPhase('listening')
      } catch {
        setError(t('errors.sttCouldNotStart'))
      }
      return
    }
    if (!caps.serverStt) {
      setError(t('errors.voiceUnavailable'))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = audioMime()
      const mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 })
      const chunks: Blob[] = []
      mr.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data) }
      mr.onstop = async () => {
        durationRef.current = Date.now() - startedAt.current
        releaseMic()
        setPhase('transcribing')
        try {
          const blob = new Blob(chunks, { type: mime.split(';')[0] })
          const res = await csrfFetch(`/api/interview-sim/${encodeURIComponent(opts.sessionId)}/transcribe`, {
            method: 'POST', credentials: 'include', body: blob, headers: { 'Content-Type': mime.split(';')[0], 'x-language': opts.language },
          })
          const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
          if (!res.ok || !j.text) throw new Error(j.error || t('errors.transcribeFailed'))
          finalText.current = j.text
          setTranscript(j.text)
        } catch (e) {
          setError(e instanceof Error ? e.message : t('errors.transcribeFailed'))
        } finally {
          setPhase('idle')
        }
      }
      mediaRef.current = mr
      startedAt.current = Date.now()
      mr.start(1000)
      setPhase('listening')
    } catch (e) {
      const name = e instanceof DOMException ? e.name : ''
      setError(name === 'NotAllowedError' ? t('errors.micBlocked') : t('errors.micCouldNotStart'))
      releaseMic()
    }
  }, [caps.serverStt, opts.language, opts.sessionId, stopSpeaking, t])

  const stop = useCallback(() => {
    if (recRef.current) { recRef.current.stop(); recRef.current = null }
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
  }, [])

  const reset = useCallback(() => { setTranscript(''); finalText.current = ''; durationRef.current = 0; setError(null) }, [])

  return { phase, transcript, setTranscript, error, speaking, supported, tts: caps.tts, speak, stopSpeaking, start, stop, reset, durationMs: () => durationRef.current }
}
