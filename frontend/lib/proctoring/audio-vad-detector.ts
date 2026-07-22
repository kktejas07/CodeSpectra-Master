/**
 * Audio / Voice Activity Detector (VAD) & Secondary Voice Monitor.
 *
 * Uses Web Audio API FFT spectrum analysis to detect:
 * 1. Ambient noise vs human speech frequency bands (85 Hz - 255 Hz fundamental voice frequencies).
 * 2. Whispering or background speech during proctored sessions.
 * 3. Secondary speaker presence.
 */

export interface AudioVADAnalysis {
  isSpeaking: boolean
  audioLevelDb: number
  speechDetected: boolean
  secondaryVoiceFlagged: boolean
  volumeAnomaly: boolean
}

export class AudioVADDetector {
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private microphoneStream: MediaStream | null = null

  public async start(): Promise<boolean> {
    try {
      this.microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.analyser = this.audioCtx.createAnalyser()
      this.analyser.fftSize = 512

      const source = this.audioCtx.createMediaStreamSource(this.microphoneStream)
      source.connect(this.analyser)
      return true
    } catch (e) {
      return false
    }
  }

  public analyzeAudio(): AudioVADAnalysis {
    if (!this.analyser) {
      return {
        isSpeaking: false,
        audioLevelDb: -60,
        speechDetected: false,
        secondaryVoiceFlagged: false,
        volumeAnomaly: false,
      }
    }

    const bufferLength = this.analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    this.analyser.getByteFrequencyData(dataArray)

    // Compute total RMS energy
    let sum = 0
    // Voice fundamental frequency bin range (~85 Hz to ~300 Hz)
    let speechEnergy = 0

    for (let i = 0; i < bufferLength; i++) {
      const val = dataArray[i]
      sum += val * val
      // Freq bin resolution approx 43 Hz per bin at 44.1kHz / 512
      if (i >= 2 && i <= 8) {
        speechEnergy += val
      }
    }

    const rms = Math.sqrt(sum / bufferLength)
    const db = 20 * Math.log10(rms || 1) - 60

    const isSpeaking = rms > 30
    const speechDetected = speechEnergy > 150
    const volumeAnomaly = rms > 120

    return {
      isSpeaking,
      audioLevelDb: Math.round(db),
      speechDetected,
      secondaryVoiceFlagged: speechDetected && rms > 80,
      volumeAnomaly,
    }
  }

  public stop(): void {
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach((t) => t.stop())
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close()
    }
  }
}

export const audioVADDetector = new AudioVADDetector()
