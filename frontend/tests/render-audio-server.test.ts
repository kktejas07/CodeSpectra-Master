// @vitest-environment jsdom
/**
 * The lesson voiceover must be served over loopback, not as a base64 data URL.
 *
 * Remotion re-parses `data:audio/mpeg;base64,…` per frame; render throughput
 * tracked the payload size (4.8MB → 10fps, 16.7MB → a crawl that looked like a
 * deadlock). Serving the same bytes from 127.0.0.1 measured 19.4fps.
 *
 * Run: npx vitest run tests/render-audio-server.test.ts
 */
import { describe, it, expect } from 'vitest'
import { serveAudio } from '@/lib/courses/render-mp4'

describe('serveAudio', () => {
  it('serves the exact buffer over loopback and closes cleanly', async () => {
    const audio = Buffer.from('ID3-fake-mp3-payload'.repeat(1000))
    const server = await serveAudio(audio)

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/voice\.mp3$/)

    const res = await fetch(server.url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('content-length')).toBe(String(audio.length))
    expect(res.headers.get('accept-ranges')).toBe('none')
    // Remotion's page is localhost:3000 — cross-origin, so CORS is required.
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(Buffer.from(await res.arrayBuffer()).equals(audio)).toBe(true)

    // Anything other than the voiceover path is a 404, not the audio.
    const miss = await fetch(server.url.replace('/voice.mp3', '/nope'))
    expect(miss.status).toBe(404)

    await server.close()
    // Port is released: the server no longer accepts connections.
    await expect(fetch(server.url)).rejects.toThrow()
  })
})
