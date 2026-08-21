import { describe, it, expect } from 'vitest'
import { vttFromSlides, vttTimestamp } from '@/lib/courses/lesson-captions'

describe('vttFromSlides', () => {
  it('emits timed cues from spokenText', () => {
    const vtt = vttFromSlides([
      { spokenText: 'Hello Java', durationInFrames: 30 },
      { spokenText: 'Next slide', durationInFrames: 60 },
    ])
    expect(vtt.startsWith('WEBVTT')).toBe(true)
    expect(vtt).toContain(vttTimestamp(0))
    expect(vtt).toContain(vttTimestamp(1))
    expect(vtt).toContain('Hello Java')
    expect(vtt).toContain('Next slide')
  })
})
