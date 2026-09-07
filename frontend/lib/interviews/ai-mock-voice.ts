// Voice I/O layer for conversational AI interviews
// Browser-only: TTS (Google Translate), STT (Web Speech API), audio state

// ── Types ──────────────────────────────────────────────────────────────

export interface VoiceState {
  isListening: boolean
  isSpeaking: boolean
  transcript: string
  finalTranscript: string
  error: string | null
  waveform: number[]
}

// ── STT: Browser Speech Recognition ────────────────────────────────────

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognitionResultList {
  length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | null
}

export function createSpeechRecognizer(options: {
  onResult: (text: string, isFinal: boolean) => void
  onError: (error: string) => void
  onEnd: () => void
}): { start: () => void; stop: () => void; abort: () => void } {
  const Ctor = getSpeechRecognitionConstructor()
  if (!Ctor) {
    // Speech recognition not available — return no-op stubs
    return {
      start: () => options.onError('Speech recognition is not supported in this browser. Use Chrome or Edge.'),
      stop: () => {},
      abort: () => {},
    }
  }

  const SpeechRecognitionCtor = Ctor
  let recognition: SpeechRecognitionLike | null = null
  let stopped = false

  function ensureRecognition(): SpeechRecognitionLike {
    if (!recognition) {
      recognition = new SpeechRecognitionCtor()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          const text = (result[0] as SpeechRecognitionAlternative).transcript || ''
          if (result.isFinal) {
            final += text
          } else {
            interim += text
          }
        }
        if (final) options.onResult(final, true)
        if (interim) options.onResult(interim, false)
      }

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        // 'no-speech' is benign — just means silence
        if (event.error === 'no-speech') return
        const msg = event.error === 'not-allowed'
          ? 'Microphone permission denied. Please allow microphone access.'
          : event.error === 'network'
            ? 'Speech recognition network error. Check your connection.'
            : `Speech recognition error: ${event.error || 'unknown'}`
        options.onError(msg)
      }

      recognition.onend = () => {
        // Auto-restart if not intentionally stopped
        if (!stopped) {
          try {
            recognition?.start()
          } catch {
            // Already started or destroyed — safe to ignore
          }
        } else {
          options.onEnd()
        }
      }
    }
    return recognition
  }

  return {
    start: () => {
      stopped = false
      try {
        ensureRecognition().start()
      } catch {
        // May already be started — safe to ignore
      }
    },
    stop: () => {
      stopped = true
      try {
        recognition?.stop()
      } catch {
        // Not started — safe to ignore
      }
    },
    abort: () => {
      stopped = true
      try {
        recognition?.abort()
      } catch {
        // Not started — safe to ignore
      }
    },
  }
}

// ── TTS: Google Translate TTS (client-side) ────────────────────────────

function splitTextForTts(text: string, maxLen = 190): string[] {
  const cleaned = (text || '').trim()
  if (!cleaned) return []
  // Split on sentence boundaries
  const sentences = cleaned.replace(/([.!?])\s+/g, '$1|').split('|').filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > maxLen) {
      if (current) chunks.push(current.trim())
      if (sentence.length > maxLen) {
        // Hard-split long sentences
        for (let i = 0; i < sentence.length; i += maxLen) {
          chunks.push(sentence.slice(i, i + maxLen).trim())
        }
        current = ''
      } else {
        current = sentence
      }
    } else {
      current = next
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

async function fetchTtsChunk(chunk: string, retries = 3): Promise<Blob | null> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&ttsspeed=1&q=${encodeURIComponent(chunk)}`
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        // Rate limited — back off
        const delay = Math.min(2000 * Math.pow(2, attempt), 8000)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      if (!res.ok) return null
      return await res.blob()
    } catch {
      if (attempt < retries - 1) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
      }
    }
  }
  return null
}

export async function synthesizeSpeech(text: string): Promise<Blob | null> {
  const chunks = splitTextForTts(text)
  if (chunks.length === 0) return null

  const blobs: Blob[] = []
  const INTER_CHUNK_DELAY = 150

  for (let i = 0; i < chunks.length; i++) {
    const blob = await fetchTtsChunk(chunks[i])
    if (blob) blobs.push(blob)
    // Pacing delay between chunks (not after last)
    if (i < chunks.length - 1 && blobs.length > 0) {
      await new Promise(r => setTimeout(r, INTER_CHUNK_DELAY))
    }
  }

  if (blobs.length === 0) return null
  if (blobs.length === 1) return blobs[0]
  return new Blob(blobs, { type: 'audio/mpeg' })
}

// ── Audio Playback ─────────────────────────────────────────────────────

export function createAudioPlayer(): {
  play: (blob: Blob) => Promise<void>
  stop: () => void
  onEnded: () => void
  isPlaying: () => boolean
} {
  let audio: HTMLAudioElement | null = null
  let playing = false
  let endCallback: (() => void) | null = null

  return {
    play: async (blob: Blob) => {
      // Stop any current playback
      if (audio) {
        audio.pause()
        audio.src = ''
        audio = null
      }
      const url = URL.createObjectURL(blob)
      audio = new Audio(url)
      playing = true

      return new Promise<void>((resolve) => {
        if (!audio) { resolve(); return }
        audio.onended = () => {
          playing = false
          URL.revokeObjectURL(url)
          audio = null
          endCallback?.()
          resolve()
        }
        audio.onerror = () => {
          playing = false
          URL.revokeObjectURL(url)
          audio = null
          endCallback?.()
          resolve()
        }
        audio.play().catch(() => {
          playing = false
          URL.revokeObjectURL(url)
          audio = null
          endCallback?.()
          resolve()
        })
      })
    },
    stop: () => {
      if (audio) {
        audio.pause()
        audio.src = ''
        playing = false
        URL.revokeObjectURL(audio.src)
        audio = null
      }
    },
    onEnded: () => { endCallback = () => {} },
    isPlaying: () => playing,
  }
}

// ── Waveform Analyzer ──────────────────────────────────────────────────

export function createWaveformAnalyzer(audioElement: HTMLAudioElement): {
  getFrequencyData: () => Uint8Array
  connect: () => void
  disconnect: () => void
} {
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let source: MediaElementAudioSourceNode | null = null
  let freqData: Uint8Array<ArrayBuffer> | null = null

  return {
    connect: () => {
      try {
        audioCtx = new AudioContext()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source = audioCtx.createMediaElementSource(audioElement)
        source.connect(analyser)
        analyser.connect(audioCtx.destination)
        freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
      } catch {
        // AudioContext or source creation failed — degrade gracefully
        audioCtx = null
        analyser = null
        source = null
      }
    },
    disconnect: () => {
      try {
        source?.disconnect()
        analyser?.disconnect()
        audioCtx?.close()
      } catch {
        // Cleanup — safe to ignore
      }
      audioCtx = null
      analyser = null
      source = null
      freqData = null
    },
    getFrequencyData: (): Uint8Array => {
      if (!analyser || !freqData) return new Uint8Array(0)
      analyser.getByteFrequencyData(freqData)
      return freqData
    },
  }
}

// ── Mic Waveform (for recording visualization) ─────────────────────────

export function createMicWaveformAnalyzer(): {
  getFrequencyData: () => Uint8Array
  connect: () => Promise<void>
  disconnect: () => void
} {
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let stream: MediaStream | null = null
  let source: MediaStreamAudioSourceNode | null = null
  let freqData: Uint8Array<ArrayBuffer> | null = null

  return {
    connect: async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioCtx = new AudioContext()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>
      } catch {
        audioCtx = null
        analyser = null
        stream = null
        source = null
      }
    },
    disconnect: () => {
      try {
        stream?.getTracks().forEach(t => t.stop())
        source?.disconnect()
        analyser?.disconnect()
        audioCtx?.close()
      } catch {
        // Cleanup — safe to ignore
      }
      audioCtx = null
      analyser = null
      stream = null
      source = null
      freqData = null
    },
    getFrequencyData: (): Uint8Array => {
      if (!analyser || !freqData) return new Uint8Array(0)
      analyser.getByteFrequencyData(freqData)
      return freqData
    },
  }
}

// ── High-Level Voice Manager ───────────────────────────────────────────

export function createVoiceManager(callbacks: {
  onTranscript: (text: string, isFinal: boolean) => void
  onAiSpeaking: (speaking: boolean) => void
  onWaveform: (data: number[]) => void
  onError: (error: string) => void
}): {
  startListening: () => void
  stopListening: () => void
  speakAi: (text: string) => Promise<void>
  stop: () => void
  getState: () => VoiceState
  destroy: () => void
} {
  let state: VoiceState = {
    isListening: false,
    isSpeaking: false,
    transcript: '',
    finalTranscript: '',
    error: null,
    waveform: [],
  }

  let destroyed = false
  let waveformInterval: ReturnType<typeof setInterval> | null = null

  const micWaveform = createMicWaveformAnalyzer()

  const recognizer = createSpeechRecognizer({
    onResult: (text, isFinal) => {
      state.transcript = isFinal ? '' : text
      if (isFinal) {
        state.finalTranscript += (state.finalTranscript ? ' ' : '') + text
      }
      callbacks.onTranscript(text, isFinal)
    },
    onError: (error) => {
      state.error = error
      callbacks.onError(error)
    },
    onEnd: () => {
      state.isListening = false
    },
  })

  const player = createAudioPlayer()

  function startWaveformLoop() {
    if (waveformInterval) return
    waveformInterval = setInterval(() => {
      if (destroyed) { stopWaveformLoop(); return }
      const data = micWaveform.getFrequencyData()
      if (data.length > 0) {
        // Simple amplitude: average of all frequency bins
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length / 255 // normalize 0-1
        // Build a simple 8-bar visualization from frequency data
        const bars: number[] = []
        const step = Math.floor(data.length / 8)
        for (let i = 0; i < 8; i++) {
          bars.push(data[i * step] / 255)
        }
        state.waveform = bars
        callbacks.onWaveform(bars)
      }
    }, 100) // 10fps — enough for smooth visualization
  }

  function stopWaveformLoop() {
    if (waveformInterval) {
      clearInterval(waveformInterval)
      waveformInterval = null
    }
  }

  return {
    startListening: () => {
      if (destroyed || state.isSpeaking) return
      state.isListening = true
      state.transcript = ''
      state.finalTranscript = ''
      state.error = null
      recognizer.start()
      micWaveform.connect().catch(() => {})
      startWaveformLoop()
    },

    stopListening: () => {
      state.isListening = false
      recognizer.stop()
      stopWaveformLoop()
      micWaveform.disconnect()
    },

    speakAi: async (text: string) => {
      if (destroyed) return
      // Stop listening while AI speaks
      recognizer.stop()
      state.isListening = false
      stopWaveformLoop()
      micWaveform.disconnect()

      state.isSpeaking = true
      callbacks.onAiSpeaking(true)

      const blob = await synthesizeSpeech(text)
      if (destroyed) return

      if (blob) {
        await player.play(blob)
      } else {
        // TTS failed — add a small delay so UI doesn't flash
        await new Promise(r => setTimeout(r, 500))
      }

      state.isSpeaking = false
      callbacks.onAiSpeaking(false)

      // Resume listening after AI finishes (if not destroyed)
      if (!destroyed) {
        state.isListening = true
        recognizer.start()
        micWaveform.connect().catch(() => {})
        startWaveformLoop()
      }
    },

    stop: () => {
      state.isListening = false
      state.isSpeaking = false
      recognizer.abort()
      player.stop()
      stopWaveformLoop()
      micWaveform.disconnect()
    },

    getState: () => ({ ...state }),

    destroy: () => {
      destroyed = true
      recognizer.abort()
      player.stop()
      stopWaveformLoop()
      micWaveform.disconnect()
    },
  }
}

// ── Browser Compat Check ───────────────────────────────────────────────

export function getVoiceCapabilities(): {
  sttSupported: boolean
  ttsSupported: boolean
  micSupported: boolean
  notes: string[]
} {
  const notes: string[] = []
  const w = typeof window !== 'undefined' ? window as unknown as Record<string, unknown> : null

  const sttSupported = !!(w && (w.SpeechRecognition || w.webkitSpeechRecognition))
  if (!sttSupported) notes.push('Speech recognition not available — use Chrome or Edge for voice input.')

  const ttsSupported = typeof Audio !== 'undefined'
  if (!ttsSupported) notes.push('Audio playback not available in this environment.')

  const micSupported = !!(navigator?.mediaDevices?.getUserMedia)
  if (!micSupported) notes.push('Micro access not available — check browser permissions.')

  return { sttSupported, ttsSupported, micSupported, notes }
}
