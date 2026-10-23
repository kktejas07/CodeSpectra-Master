import { describe, it, expect } from 'vitest'
import { fetchSessionState } from '@/lib/session-fetch'

const res = (status: number, body?: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
const seq = (...rs: Array<Response | Error>) => {
  let i = 0
  return (async () => { const r = rs[Math.min(i++, rs.length - 1)]; if (r instanceof Error) throw r; return r }) as unknown as typeof fetch
}
const sleep = async () => {}

describe('fetchSessionState', () => {
  it('returns the user on 200', async () => {
    expect(await fetchSessionState({ fetchImpl: seq(res(200, { user: { uid: 'u1' } })), sleep })).toEqual({ status: 'user', user: { uid: 'u1' } })
  })
  it('treats 401 and 200-without-user as signed out', async () => {
    expect((await fetchSessionState({ fetchImpl: seq(res(401)), sleep })).status).toBe('none')
    expect((await fetchSessionState({ fetchImpl: seq(res(200, { user: null })), sleep })).status).toBe('none')
  })
  it('retries a 429 / 5xx / network error and recovers', async () => {
    const f = seq(res(429, { error: 'Too many' }, { 'retry-after': '2' }), res(503), new Error('offline'), res(200, { user: { uid: 'u2' } }))
    expect(await fetchSessionState({ fetchImpl: f, sleep })).toEqual({ status: 'user', user: { uid: 'u2' } })
  })
  it('never reports a persistent rate limit as signed out', async () => {
    expect((await fetchSessionState({ fetchImpl: seq(res(429)), sleep, retries: 2 })).status).toBe('unknown')
  })
})
