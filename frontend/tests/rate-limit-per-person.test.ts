import { describe, it, expect } from 'vitest'
import { edgeRateLimit, globalApiLimitKey, GLOBAL_API_PER_IP, GLOBAL_API_PER_PERSON } from '@/lib/edge-rate-limit'
import { fetchWithRetry, isTransientStatus } from '@/lib/fetch-retry'

describe('global API limit key', () => {
  it('gives each signed-in person on a shared IP their own budget', () => {
    const ip = '203.0.113.7' // one campus NAT
    expect(globalApiLimitKey(ip, 'u1')).not.toBe(globalApiLimitKey(ip, 'u2'))
    expect(globalApiLimitKey(ip, null)).toBe('api:ip:203.0.113.7')
    // 300 students × 1 request each fit; one person alone is still capped.
    for (let i = 0; i < 300; i++) expect(edgeRateLimit(globalApiLimitKey(ip, `s${i}`), GLOBAL_API_PER_PERSON, 60_000).ok).toBe(true)
    const k = globalApiLimitKey(ip, 'busy')
    for (let i = 0; i < GLOBAL_API_PER_PERSON; i++) edgeRateLimit(k, GLOBAL_API_PER_PERSON, 60_000)
    expect(edgeRateLimit(k, GLOBAL_API_PER_PERSON, 60_000).ok).toBe(false)
    expect(GLOBAL_API_PER_IP).toBeGreaterThan(GLOBAL_API_PER_PERSON * 10)
  })
})

describe('fetchWithRetry', () => {
  const res = (status: number, headers: Record<string, string> = {}) => new Response('{}', { status, headers })
  const seq = (...rs: Array<Response | Error>) => {
    let i = 0
    return (async () => { const r = rs[Math.min(i++, rs.length - 1)]; if (r instanceof Error) throw r; return r }) as unknown as typeof fetch
  }
  const sleep = async () => {}
  it('rides out 429 / 5xx / network errors', async () => {
    const r = await fetchWithRetry('/x', undefined, { fetchImpl: seq(res(429, { 'retry-after': '3' }), res(502), new Error('net'), res(200)), sleep })
    expect(r.status).toBe(200)
  })
  it('returns real errors (404/403) straight away and the last transient one after retries', async () => {
    expect((await fetchWithRetry('/x', undefined, { fetchImpl: seq(res(404), res(200)), sleep })).status).toBe(404)
    expect((await fetchWithRetry('/x', undefined, { fetchImpl: seq(res(429)), sleep, retries: 2 })).status).toBe(429)
    expect(isTransientStatus(429) && isTransientStatus(503) && !isTransientStatus(404)).toBe(true)
  })
})
