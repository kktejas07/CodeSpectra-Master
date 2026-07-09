'use client'

/**
 * Speech Recognition Utility
 * Handles browser Speech-to-Text API with fallback support
 */

export interface SpeechRecognitionConfig {
  language?: string
  continuous?: boolean
  interimResults?: boolean
  maxAlternatives?: number
}

export interface SpeechRecognitionResult {
  transcript: string
  confidence: number
  isFinal: boolean
}

// Minimal shape of a SpeechRecognition instance (Web Speech API is not fully
// typed by the TS DOM lib, so we declare only the members we use).
interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  language: string
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance

// The Web Speech API event payloads (not present in the active TS DOM lib).
interface SpeechRecognitionErrorEvent {
  error: string
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface WebSpeechResult extends ArrayLike<SpeechRecognitionAlternative> {
  isFinal: boolean
}

interface SpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<WebSpeechResult>
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

// Get the appropriate SpeechRecognition API
const getSpeechRecognition = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null

  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export class SpeechToTextManager {
  private recognition: SpeechRecognitionInstance | null = null
  private isListening = false
  private transcript = ''
  private finalTranscript = ''
  private onResultCallback: ((result: SpeechRecognitionResult) => void) | null = null
  private onErrorCallback: ((error: string) => void) | null = null
  private onStartCallback: (() => void) | null = null
  private onEndCallback: (() => void) | null = null

  constructor(config: SpeechRecognitionConfig = {}) {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      console.warn('Speech Recognition API not supported in this browser')
      return
    }

    this.recognition = new Ctor()
    this.recognition.continuous = config.continuous ?? true
    this.recognition.interimResults = config.interimResults ?? true
    this.recognition.language = config.language ?? 'en-US'
    this.recognition.maxAlternatives = config.maxAlternatives ?? 1

    this.setupEventListeners()
  }

  private setupEventListeners() {
    if (!this.recognition) return

    this.recognition.onstart = () => {
      this.isListening = true
      this.onStartCallback?.()
    }

    this.recognition.onend = () => {
      this.isListening = false
      this.onEndCallback?.()
    }

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorMessage = `Speech recognition error: ${event.error}`
      console.error(errorMessage)
      this.onErrorCallback?.(errorMessage)
    }

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.transcript = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptSegment = event.results[i][0].transcript
        this.transcript += transcriptSegment

        if (event.results[i].isFinal) {
          this.finalTranscript += transcriptSegment + ' '
        }
      }

      const isFinal = event.results[event.results.length - 1].isFinal
      const confidence = event.results[event.results.length - 1][0].confidence

      this.onResultCallback?.({
        transcript: isFinal ? this.finalTranscript : this.transcript,
        confidence,
        isFinal,
      })
    }
  }

  public start(): void {
    if (!this.recognition) {
      console.warn('Speech Recognition not available')
      return
    }

    this.transcript = ''
    this.finalTranscript = ''
    this.recognition.start()
  }

  public stop(): void {
    if (!this.recognition) return
    this.recognition.stop()
  }

  public abort(): void {
    if (!this.recognition) return
    this.recognition.abort()
  }

  public setLanguage(language: string): void {
    if (!this.recognition) return
    this.recognition.language = language
  }

  public onResult(callback: (result: SpeechRecognitionResult) => void): void {
    this.onResultCallback = callback
  }

  public onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback
  }

  public onStart(callback: () => void): void {
    this.onStartCallback = callback
  }

  public onEnd(callback: () => void): void {
    this.onEndCallback = callback
  }

  public getTranscript(): string {
    return this.finalTranscript
  }

  public resetTranscript(): void {
    this.transcript = ''
    this.finalTranscript = ''
  }

  public isSupported(): boolean {
    return getSpeechRecognition() !== null
  }

  public getListeningStatus(): boolean {
    return this.isListening
  }
}

/**
 * Hook for using Speech-to-Text in React components
 */
export function useSpeechToText(config?: SpeechRecognitionConfig) {
  const [isListening, setIsListening] = React.useState(false)
  const [transcript, setTranscript] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const managerRef = React.useRef<SpeechToTextManager | null>(null)

  React.useEffect(() => {
    managerRef.current = new SpeechToTextManager(config)

    managerRef.current.onStart(() => setIsListening(true))
    managerRef.current.onEnd(() => setIsListening(false))
    managerRef.current.onError(setError)
    managerRef.current.onResult((result) => {
      setTranscript(result.transcript)
    })

    return () => {
      managerRef.current?.abort()
    }
  }, [config])

  return {
    transcript,
    isListening,
    error,
    startListening: () => managerRef.current?.start(),
    stopListening: () => managerRef.current?.stop(),
    resetTranscript: () => {
      managerRef.current?.resetTranscript()
      setTranscript('')
    },
    setLanguage: (lang: string) => managerRef.current?.setLanguage(lang),
    isSupported: managerRef.current?.isSupported() ?? false,
  }
}

import React from 'react'
