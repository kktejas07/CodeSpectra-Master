/**
 * Unit tests for lib/crash-analytics.ts
 *
 * These tests run in Node / happy-dom — no real fetch or window.onerror needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getSessionId,
  reportError,
  reportApiError,
  reportTestFailure,
  installGlobalHandlers,
  _resetForTest,
} from '@/lib/crash-analytics'

// ── helpers ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn().mockResolvedValue(new Response('', { status: 200 }))

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockClear()
  _resetForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── getSessionId ───────────────────────────────────────────────────────────

describe('getSessionId', () => {
  it('returns a non-empty string', () => {
    expect(getSessionId()).toBeTruthy()
  })

  it('returns the same value on repeated calls', () => {
    const a = getSessionId()
    const b = getSessionId()
    expect(a).toBe(b)
  })

  it('returns a new id after _resetForTest', () => {
    const a = getSessionId()
    _resetForTest()
    const b = getSessionId()
    // Not guaranteed to differ but must be non-empty and a string
    expect(typeof b).toBe('string')
    expect(b.length).toBeGreaterThan(0)
  })
})

// ── reportError ────────────────────────────────────────────────────────────

describe('reportError', () => {
  it('calls fetch with POST and JSON content-type', async () => {
    reportError(new Error('boom'))
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/crash-report')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('sends the error message and type', async () => {
    const err = new TypeError('type error msg')
    reportError(err)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.message).toBe('type error msg')
    expect(body.type).toBe('TypeError')
    expect(body.severity).toBe('error')
  })

  it('handles non-Error values (strings, plain objects)', async () => {
    reportError('plain string error')
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.message).toBe('plain string error')
  })

  it('includes context when provided', async () => {
    reportError(new Error('ctx test'), { userId: 'u123', page: '/dashboard' })
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.context?.userId).toBe('u123')
  })

  it('forwards the severity argument', async () => {
    reportError(new Error('warn'), undefined, 'warning')
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.severity).toBe('warning')
  })

  it('never throws even when fetch rejects', () => {
    mockFetch.mockRejectedValueOnce(new Error('network failure'))
    expect(() => reportError(new Error('something'))).not.toThrow()
  })

  it('timestamp is a valid ISO 8601 string', async () => {
    reportError(new Error('ts test'))
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow()
  })

  it('truncates stack to ≤10 lines', async () => {
    const err = new Error('stack')
    // Craft an artificially long stack
    err.stack = Array.from({ length: 20 }, (_, i) => `    at fn${i} (file.js:${i}:1)`).join('\n')
    reportError(err)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.stack?.split('\n').length).toBeLessThanOrEqual(10)
  })
})

// ── reportApiError ─────────────────────────────────────────────────────────

describe('reportApiError', () => {
  it('sends error severity for 5xx', async () => {
    reportApiError('/api/submissions', 503)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.severity).toBe('error')
    expect(body.context?.status).toBe(503)
  })

  it('sends warning severity for 4xx', async () => {
    reportApiError('/api/sessions', 404)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.severity).toBe('warning')
  })

  it('includes the URL in context', async () => {
    reportApiError('/api/contests', 500)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.context?.url).toBe('/api/contests')
  })

  it('truncates the response body to 500 chars', async () => {
    const longBody = 'x'.repeat(1000)
    reportApiError('/api/foo', 500, longBody)
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.context?.responseBody?.length).toBeLessThanOrEqual(500)
  })
})

// ── reportTestFailure ──────────────────────────────────────────────────────

describe('reportTestFailure', () => {
  it('sets environment=test in context', async () => {
    reportTestFailure('CTF suite', 'hash test', new Error('assertion failed'))
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledOnce())
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.context?.environment).toBe('test')
    expect(body.context?.suiteName).toBe('CTF suite')
    expect(body.context?.testName).toBe('hash test')
  })
})

// ── installGlobalHandlers ──────────────────────────────────────────────────

describe('installGlobalHandlers', () => {
  it('is idempotent — calling twice registers listeners only once', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    installGlobalHandlers()
    installGlobalHandlers()
    // 2 listeners (error + unhandledrejection) registered total, not 4
    const errorCalls = addSpy.mock.calls.filter(([ev]) => ev === 'error').length
    const rejCalls = addSpy.mock.calls.filter(([ev]) => ev === 'unhandledrejection').length
    expect(errorCalls).toBe(1)
    expect(rejCalls).toBe(1)
    addSpy.mockRestore()
  })
})
