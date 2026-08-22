import * as googleTTS from 'google-tts-api'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

/** Split at sentence boundaries so each Google TTS request stays under the 200-char cap. */
export function splitTextForTts(text: string, maxLen = 190): string[] {
  const sentences = text.replace(/([.!?])\s+/g, '$1|').split('|').filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence
    if (next.length > maxLen) {
      if (current) chunks.push(current.trim())
      if (sentence.length > maxLen) {
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

/**
 * Word-count estimate used before TTS is measured.
 * Google Translate TTS is often slower than 150 wpm — always prefer measureMp3DurationSeconds + align.
 */
export function estimateSpokenSeconds(text: string): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(3, Math.round((words / 150) * 60))
}

export function durationFramesFromSpoken(text: string, fps = 30): number {
  return Math.round(estimateSpokenSeconds(text) * fps)
}

/**
 * Stretch/shrink each slide's durationInFrames so the visual timeline matches the real MP3 length.
 * Without this, Remotion advances slides on word-count estimates while one continuous TTS track plays → A/V drift.
 */
export function alignSlideDurationsToAudio<T extends { durationInFrames: number }>(
  slides: T[],
  audioSeconds: number,
  fps = 30,
): T[] {
  if (!slides.length || !(audioSeconds > 0)) return slides
  const estimated = slides.reduce((n, s) => n + Math.max(1, s.durationInFrames || 0), 0)
  if (estimated <= 0) return slides
  const targetFrames = Math.max(slides.length * 30, Math.round(audioSeconds * fps))
  const scale = targetFrames / estimated
  let used = 0
  return slides.map((s, i) => {
    if (i === slides.length - 1) {
      return { ...s, durationInFrames: Math.max(30, targetFrames - used) }
    }
    const frames = Math.max(30, Math.round(Math.max(1, s.durationInFrames) * scale))
    used += frames
    return { ...s, durationInFrames: frames }
  })
}

/** MPEG frame sample counts (Layer III). */
const MPEG_SAMPLES: Record<number, Record<number, number>> = {
  3: { 1: 384, 2: 1152, 3: 1152 }, // MPEG1
  2: { 1: 384, 2: 1152, 3: 576 },  // MPEG2
  0: { 1: 384, 2: 1152, 3: 576 },  // MPEG2.5
}

const MPEG_SR: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
}

const MPEG_BR: Record<number, Record<number, number[]>> = {
  // MPEG1
  3: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  // MPEG2 / 2.5
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
}
MPEG_BR[0] = MPEG_BR[2]

/** Pure JS MP3 duration (works for concatenated Google TTS chunks). */
export function measureMp3DurationSeconds(buf: Buffer): number {
  if (!buf?.length) return 0
  let i = 0
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    i = 10 + size
  }
  let totalSamples = 0
  let sampleRate = 0
  let frames = 0
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
      i++
      continue
    }
    const versionId = (buf[i + 1] >> 3) & 0x3 // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerIndex = (buf[i + 1] >> 1) & 0x3 // 1=III, 2=II, 3=I (inverted)
    const layer = ({ 1: 3, 2: 2, 3: 1 } as Record<number, number>)[layerIndex]
    const bitrateIdx = (buf[i + 2] >> 4) & 0xf
    const srIdx = (buf[i + 2] >> 2) & 0x3
    const padding = (buf[i + 2] >> 1) & 0x1
    if (!layer || versionId === 1 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) {
      i++
      continue
    }
    const brTable = MPEG_BR[versionId]?.[layer]
    const srTable = MPEG_SR[versionId]
    const samplesTable = MPEG_SAMPLES[versionId]
    if (!brTable || !srTable || !samplesTable) {
      i++
      continue
    }
    const bitrate = brTable[bitrateIdx] * 1000
    const sr = srTable[srIdx]
    const samples = samplesTable[layer]
    if (!bitrate || !sr || !samples) {
      i++
      continue
    }
    const frameLen = Math.floor(((versionId === 3 ? 144 : 72) * bitrate) / sr) + padding
    if (frameLen < 4 || i + frameLen > buf.length) {
      i++
      continue
    }
    totalSamples += samples
    sampleRate = sr
    frames++
    i += frameLen
  }
  if (sampleRate > 0 && totalSamples > 0) return totalSamples / sampleRate
  // Fallback: ~32 kbps Google TTS
  if (frames === 0 && buf.length > 0) return Math.max(1, buf.length / 4000)
  return 0
}

/** Prefer ffprobe when present; fall back to MP3 frame parse. */
export async function measureAudioDurationSeconds(buf: Buffer): Promise<number> {
  const parsed = measureMp3DurationSeconds(buf)
  const dir = await mkdtemp(path.join(tmpdir(), 'cs-audio-'))
  const file = path.join(dir, 'voice.mp3')
  try {
    await writeFile(file, buf)
    for (const bin of ['ffprobe', '/usr/bin/ffprobe', '/usr/local/bin/ffprobe']) {
      try {
        const { stdout } = await execFileAsync(bin, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          file,
        ], { timeout: 15000 })
        const sec = parseFloat(String(stdout).trim())
        if (Number.isFinite(sec) && sec > 0) return sec
      } catch {
        /* try next binary / fall through */
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  return parsed
}

/**
 * Google Translate TTS (no API key). Throws if every chunk fails — callers must not
 * silently mark a lesson "generated" without audio.
 */
export async function synthesizeTts(text: string): Promise<Buffer> {
  const spoken = (text || '').trim()
  if (!spoken) throw new Error('No spoken text to synthesize')

  const chunks = splitTextForTts(spoken)
  const buffers: Buffer[] = []
  for (const chunk of chunks) {
    const results = await googleTTS.getAllAudioBase64(chunk, {
      lang: 'en',
      slow: false,
      host: 'https://translate.google.com',
      timeout: 20000,
    })
    for (const r of results) {
      buffers.push(Buffer.from(r.base64, 'base64'))
    }
  }
  if (buffers.length === 0) throw new Error('TTS returned no audio')
  return Buffer.concat(buffers)
}
