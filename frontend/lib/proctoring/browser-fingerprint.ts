/**
 * Browser fingerprint utility for device-switching detection.
 * Generates a lightweight hash from canvas, WebGL, audio, and navigator properties.
 */
export interface BrowserFingerprint {
  hash: string
  canvas: string
  webgl: string
  audio: string
  screen: string
  timezone: string
  language: string
  platform: string
  hardwareConcurrency: number
  deviceMemory: number | null
  maxTouchPoints: number
  timestamp: number
}

function canvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.textBaseline = 'top'
    ctx.font = '14px Arial'
    ctx.fillStyle = '#f60'
    ctx.fillRect(125, 1, 62, 20)
    ctx.fillStyle = '#069'
    ctx.fillText('CodeSpectra fingerprint', 2, 15)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)'
    ctx.fillText('CodeSpectra fingerprint', 4, 17)
    return canvas.toDataURL().slice(-100)
  } catch { return '' }
}

function webglFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') as any || canvas.getContext('experimental-webgl') as any
    if (!gl) return ''
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
    if (!debugInfo) return ''
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    return `${vendor}|${renderer}`
  } catch { return '' }
}

function audioFingerprint(): string {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContext) return ''
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const analyser = ctx.createAnalyser()
    const gain = ctx.createGain()
    const scriptProcessor = ctx.createScriptProcessor(4096, 1, 1)
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(10000, ctx.currentTime)
    gain.gain.setValueAtTime(0, ctx.currentTime)
    oscillator.connect(analyser)
    analyser.connect(scriptProcessor)
    scriptProcessor.connect(gain)
    gain.connect(ctx.destination)
    oscillator.start(0)
    const data = new Float32Array(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(data)
    oscillator.stop()
    ctx.close()
    const sum = data.reduce((a, b) => a + b, 0)
    return String(sum.toFixed(6))
  } catch { return '' }
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function generateFingerprint(): BrowserFingerprint {
  const canvas = canvasFingerprint()
  const webgl = webglFingerprint()
  const audio = audioFingerprint()
  const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const language = navigator.language
  const platform = navigator.platform
  const hardwareConcurrency = navigator.hardwareConcurrency || 0
  const deviceMemory = (navigator as any).deviceMemory || null
  const maxTouchPoints = navigator.maxTouchPoints || 0

  const raw = [canvas, webgl, audio, screen, timezone, language, platform, hardwareConcurrency, deviceMemory, maxTouchPoints].join('|')
  const hash = simpleHash(raw)

  return {
    hash, canvas, webgl, audio, screen, timezone, language, platform,
    hardwareConcurrency, deviceMemory, maxTouchPoints, timestamp: Date.now(),
  }
}

export function fingerprintChanged(original: BrowserFingerprint, current: BrowserFingerprint): boolean {
  // Hash mismatch means fingerprint changed
  if (original.hash !== current.hash) return true
  // Screen change = likely different device
  if (original.screen !== current.screen) return true
  // Platform change = likely different OS
  if (original.platform !== current.platform) return true
  return false
}
