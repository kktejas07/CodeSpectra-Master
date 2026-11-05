import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n/client', () => ({ useT: () => ({ t: (k: string) => k, locale: 'en' }) }))

import { pickVoice, speakableText } from '@/components/voice/use-browser-voice'

describe('speakableText', () => {
  it('strips markdown markup', () => {
    expect(speakableText('**bold** *em* # heading [link](https://x.com)')).toBe('bold em heading link')
  })
  it('keeps inline-code text, drops fenced blocks and images', () => {
    expect(speakableText('run `npm test` then ```js\ncode\n``` ![alt](a.png)')).toBe('run npm test then')
  })
  it('collapses whitespace and caps at 4000 chars', () => {
    expect(speakableText('a\n\n\t b')).toBe('a b')
    expect(speakableText('x'.repeat(5000)).length).toBe(4000)
  })
})

describe('pickVoice', () => {
  const voices = [
    { name: 'B', lang: 'en-US' },
    { name: 'A', lang: 'en-IN' },
    { name: 'C', lang: 'hi-IN' },
  ] as unknown as SpeechSynthesisVoice[]

  it('prefers the exact BCP-47 tag', () => {
    expect(pickVoice(voices, 'en-IN')?.name).toBe('A')
    expect(pickVoice(voices, 'en-US')?.name).toBe('B')
  })
  it('falls back to the first voice of the same language base', () => {
    expect(pickVoice(voices, 'en-GB')?.name).toBe('B')
    expect(pickVoice(voices, 'hi-LK')?.name).toBe('C')
  })
  it('returns undefined when nothing matches', () => {
    expect(pickVoice(voices, 'te-IN')).toBeUndefined()
  })
})

describe('useBrowserVoice', () => {
  it('starts with no STT support and surfaces the unavailable error', async () => {
    const { renderHook, act } = await import('@testing-library/react')
    const { useBrowserVoice } = await import('@/components/voice/use-browser-voice')
    const w = window as unknown as Record<string, unknown>
    delete w.SpeechRecognition
    delete w.webkitSpeechRecognition
    const { result } = renderHook(() => useBrowserVoice())
    expect(result.current.supported).toBe(false)
    await act(async () => {
      result.current.start()
    })
    expect(result.current.error).toBe('errors.voiceUnavailable')
  })
})
