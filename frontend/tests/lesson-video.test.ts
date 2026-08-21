/**
 * Course video script parsing + duration math.
 * Run: npx vitest run tests/lesson-video.test.ts
 */
import { describe, it, expect } from 'vitest'
import { slidesFromAiJson, withDurations, normalizeBullets } from '@/lib/courses/lesson-video'
import { durationFramesFromSpoken, estimateSpokenSeconds, splitTextForTts } from '@/lib/courses/tts'
import { isStaleRunning, STALE_RUNNING_MS } from '@/lib/courses/process-job'

const fiveSlides = {
  slides: [
    { id: 's1', type: 'title', title: 'Welcome', content: ['Intro'], spokenText: 'Welcome to this lesson. We will cover backend development, servers, APIs, and why Node.js is a popular runtime for building scalable systems used in production today by many companies worldwide including streaming platforms.' },
    { id: 's2', type: 'concept', title: 'What', content: ['Definition'], spokenText: 'Backend web development focuses on the server side of applications. It handles requests, talks to databases, applies business logic, and sends responses back to the client in formats such as JSON or HTML so the user interface can stay simple.' },
    { id: 's3', type: 'concept', title: 'Why', content: ['Reason'], spokenText: 'Without a backend, a web app cannot authenticate users, store data, or coordinate multiple clients. That is why every real product needs a server even if the frontend looks complete on its own in the browser during early prototypes.' },
    { id: 's4', type: 'code', title: 'How', code: 'console.log(1)', codeLanguage: 'js', content: ['HTTP server'], spokenText: 'Here is a tiny Node.js server. We import http, create a listener that returns Hello World with status 200, and bind it to port 3000 so a browser can reach it on localhost during local development and testing of the request cycle.' },
    { id: 's5', type: 'concept', title: 'Where', content: ['Netflix'], spokenText: 'Companies like Netflix use Node.js for IO heavy microservices because the event loop handles many connections without blocking. That same model is why chat apps, APIs, and streaming gateways often pick Node over a thread per request runtime.' },
  ],
}

describe('normalizeBullets', () => {
  it('accepts arrays and lone strings', () => {
    expect(normalizeBullets(['a', 'b'])).toEqual(['a', 'b'])
    expect(normalizeBullets('one')).toEqual(['one'])
    expect(normalizeBullets(null)).toEqual([])
  })
})

describe('slidesFromAiJson', () => {
  it('parses slides and rejects stubs', () => {
    const slides = slidesFromAiJson(fiveSlides)
    expect(slides).toHaveLength(5)
    expect(slides[0].type).toBe('title')
    expect(slides[3].code).toBe('console.log(1)')
  })

  it('accepts the legacy scenes key', () => {
    expect(slidesFromAiJson({ scenes: fiveSlides.slides })).toHaveLength(5)
  })

  it('rejects the 2-scene mock that produced 13s silent videos', () => {
    expect(() => slidesFromAiJson({
      scenes: [
        { title: 'Introduction', content: ['Understanding Java'], spokenText: 'Let me explain.' },
        { title: 'Key Concepts', content: ['Core ideas'], spokenText: 'The key concepts.' },
      ],
    })).toThrow(/at least 5 slides/)
  })
})

describe('duration', () => {
  it('sizes ~150 wpm so 90 words is about 36 seconds, not 3', () => {
    const words = Array.from({ length: 90 }, () => 'word').join(' ')
    expect(estimateSpokenSeconds(words)).toBe(36)
    expect(durationFramesFromSpoken(words)).toBe(36 * 30)
  })

  it('8 long slides land in the 3–6 minute Unstop range', () => {
    const spoken = Array.from({ length: 90 }, () => 'word').join(' ')
    const slides = withDurations(Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`, type: 'concept' as const, title: 'T', content: ['c'], spokenText: spoken,
    })))
    const seconds = slides.reduce((n, s) => n + s.durationInFrames, 0) / 30
    expect(seconds).toBeGreaterThanOrEqual(180)
    expect(seconds).toBeLessThanOrEqual(360)
  })
})

describe('splitTextForTts', () => {
  it('keeps chunks under the Google 200-char cap', () => {
    const long = 'Hello world. '.repeat(40)
    const chunks = splitTextForTts(long)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(c => c.length <= 190)).toBe(true)
  })
})

describe('stale running jobs', () => {
  it('flags a running job older than 45 minutes', () => {
    const now = Date.parse('2026-08-21T12:00:00Z')
    expect(isStaleRunning({ status: 'running', startedAt: '2026-08-21T11:59:00Z' }, now)).toBe(false)
    expect(isStaleRunning({
      status: 'running',
      startedAt: new Date(now - STALE_RUNNING_MS - 1000).toISOString(),
    }, now)).toBe(true)
    expect(isStaleRunning({ status: 'pending', startedAt: '2020-01-01T00:00:00Z' }, now)).toBe(false)
  })
})
