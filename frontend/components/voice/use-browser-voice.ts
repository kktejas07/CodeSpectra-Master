'use client'

/**
 * Browser-only voice I/O for chat boxes (copilot): Web Speech API recognition
 * in the interface language (en-IN / hi-IN / te-IN) and speech synthesis for
 * replies. Nothing leaves the browser except what the browser's own speech
 * service does; no audio is recorded or stored by CodeSpectra. The mic opens
 * only after an explicit press and closes when listening stops.
 * (The interview simulator has its own hook with a Deepgram fallback:
 * components/interview-sim/use-voice.ts.)
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LOCALE_META, type Locale } from '@/lib/i18n/config'
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

/** Strip markdown so the synthesiser doesn't read out asterisks and pipes. */
export function speakableText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

export function pickVoice(voices: SpeechSynthesisVoice[], tag: string): SpeechSynthesisVoice | undefined {
  const base = tag.split('-')[0].toLowerCase()
  return voices.find((v) => v.lang === tag) ?? voices.find((v) => v.lang.toLowerCase().startsWith(base))
}

export function useBrowserVoice(opts: { locale?: Locale; onFinal?: (text: string) => void } = {}) {
  const { t, locale: uiLocale } = useT()
  const tag = LOCALE_META[opts.locale ?? uiLocale].speech
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Failure kind — "blocked" shows the browser-permission fix card proactively. */
  const [errorKind, setErrorKind] = useState<'blocked' | 'stopped' | 'unavailable' | null>(null)
  const [micPermission, setMicPermission] = useState<'unknown' | 'granted' | 'prompt' | 'denied'>('unknown')
  const [caps, setCaps] = useState({ stt: false, tts: false })
  const recRef = useRef<RecognitionLike | null>(null)
  const onFinalRef = useRef(opts.onFinal)
  onFinalRef.current = opts.onFinal

  useEffect(() => {
    setCaps({ stt: !!recognitionCtor(), tts: typeof window !== 'undefined' && 'speechSynthesis' in window })
  }, [])

  // Probe the browser's mic permission up front: a "denied" state means Chrome
  // will NEVER re-prompt (allow/block dialogs only appear for "prompt"), so the
  // user must unblock it in site settings — surface that before they click.
  // Follows live changes so the card clears itself when the user fixes it.
  useEffect(() => {
    let status: PermissionStatus | null = null
    let cancelled = false
    const apply = () => {
      if (cancelled || !status) return
      setMicPermission(status.state as 'granted' | 'prompt' | 'denied')
      if (status.state === 'denied') {
        setErrorKind('blocked')
        setError(t('errors.micBlocked'))
      } else if (status.state === 'granted' && !listening) {
        setErrorKind(null)
        setError(null)
      }
    }
    navigator.permissions?.query({ name: 'microphone' as PermissionName })
      .then((s) => {
        status = s
        s.onchange = apply
        apply()
      })
      .catch(() => { /* some browsers have no "microphone" descriptor — keep the click-time path */ })
    return () => { cancelled = true; if (status) status.onchange = null }
  }, [listening, t])

  useEffect(() => () => {
    recRef.current?.abort()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    setError(null)
    setErrorKind(null)
    setInterim('')
    const Ctor = recognitionCtor()
    if (!Ctor) { setError(t('errors.voiceUnavailable')); setErrorKind('unavailable'); return }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    const rec = new Ctor()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = tag
    let finalText = ''
    rec.onresult = (e) => {
      let live = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += `${r[0].transcript} `
        else live += r[0].transcript
      }
      setInterim(`${finalText}${live}`.trim())
    }
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setMicPermission('denied')
        setErrorKind('blocked')
        setError(t('errors.micBlocked'))
      } else {
        setErrorKind('stopped')
        setError(t('errors.sttStopped'))
      }
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
      const text = finalText.trim()
      setInterim('')
      if (text) onFinalRef.current?.(text)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setError(t('errors.sttCouldNotStart'))
    }
  }, [tag, t])

  const speak = useCallback((text: string) => {
    if (!caps.tts || !text) return
    try {
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(speakableText(text))
      u.lang = tag
      const v = pickVoice(window.speechSynthesis.getVoices(), tag)
      if (v) u.voice = v
      u.onstart = () => setSpeaking(true)
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      window.speechSynthesis.speak(u)
    } catch {
      setSpeaking(false)
    }
  }, [caps.tts, tag])

  const stopSpeaking = useCallback(() => {
    if (caps.tts) window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [caps.tts])

  return {
    supported: caps.stt,
    tts: caps.tts,
    listening,
    interim,
    speaking,
    error,
    errorKind,
    micPermission,
    start,
    stop,
    speak,
    stopSpeaking,
    tag,
  }
}
