import * as googleTTS from 'google-tts-api'

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

/** ~150 wpm spoken English → seconds. */
export function estimateSpokenSeconds(text: string): number {
  const words = (text || '').trim().split(/\s+/).filter(Boolean).length
  return Math.max(3, Math.round((words / 150) * 60))
}

export function durationFramesFromSpoken(text: string, fps = 30): number {
  return Math.round(estimateSpokenSeconds(text) * fps)
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
