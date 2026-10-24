/**
 * Cross-encoder rerank of the fused head (lib/rag/rerank): config, the pure
 * reorder, and the provider chain with a mocked fetch — any failure keeps the
 * fused order.
 *
 * Run: npx vitest run tests/rag-rerank.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const keys = vi.hoisted(() => ({ map: {} as Record<string, string> }))
const api = vi.hoisted(() => ({
  markRateLimited: vi.fn(async () => {}),
  trackAiUsage: vi.fn(async () => {}),
}))
vi.mock('@/lib/ai/get-api-key', () => ({
  getApiKey: async (p: string) => (keys.map[p] ? { key: keys.map[p], provider: p, source: 'secret' } : null),
  markRateLimited: api.markRateLimited,
  trackAiUsage: api.trackAiUsage,
}))

import { applyRerank, parseRerankResults, RERANK_DEFAULTS, rerankConfig, rerankDocuments, rerankRows, resetRerankWarnings } from '@/lib/rag/rerank'

const rows = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, text: `doc ${id}` }))
const ids = (xs: { id: string }[]) => xs.map((x) => x.id)
const cfg = (over: Partial<typeof RERANK_DEFAULTS> = {}) => ({ ...RERANK_DEFAULTS, ...over })
const ok = (results: unknown) => new Response(JSON.stringify({ results }), { status: 200, headers: { 'Content-Type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  keys.map = {}
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  api.markRateLimited.mockClear()
  api.trackAiUsage.mockClear()
  resetRerankWarnings()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  warn.mockRestore()
  vi.useRealTimers()
})

describe('rerankConfig', () => {
  it('defaults, clamps, and RAG_RERANK=0 switches it off', () => {
    expect(rerankConfig({})).toEqual(RERANK_DEFAULTS)
    expect(RERANK_DEFAULTS).toEqual({ enabled: true, candidates: 30, timeoutMs: 3000 })
    expect(rerankConfig({ RAG_RERANK_CANDIDATES: '1' }).candidates).toBe(5)
    expect(rerankConfig({ RAG_RERANK_CANDIDATES: '500' }).candidates).toBe(100)
    expect(rerankConfig({ RAG_RERANK_CANDIDATES: 'x', RAG_RERANK_TIMEOUT_MS: '' })).toEqual(RERANK_DEFAULTS)
    expect(rerankConfig({ RAG_RERANK_TIMEOUT_MS: '1' }).timeoutMs).toBe(200)
    expect(rerankConfig({ RAG_RERANK: '0' }).enabled).toBe(false)
    expect(rerankConfig({ RAG_RERANK: 'off' }).enabled).toBe(false)
    expect(rerankConfig({ RAG_RERANK: '1' }).enabled).toBe(true)
  })
})

describe('applyRerank (pure)', () => {
  it('orders the head by score; the tail keeps its fused order after it', () => {
    const out = applyRerank(rows, 3, [{ index: 0, relevance_score: 0.1 }, { index: 2, relevance_score: 0.9 }, { index: 1, relevance_score: 0.5 }])
    expect(ids(out)).toEqual(['c', 'b', 'a', 'd', 'e'])
    expect(out[0].rerankScore).toBe(0.9)
    expect(out[3].rerankScore).toBeUndefined()
  })

  it('head rows the provider skipped follow the scored ones in fused order', () => {
    expect(ids(applyRerank(rows, 4, [{ index: 3, relevance_score: 0.8 }]))).toEqual(['d', 'a', 'b', 'c', 'e'])
  })

  it('ties keep fused order; bad indexes / scores and duplicates are ignored', () => {
    const out = applyRerank(rows, 3, [
      { index: 1, relevance_score: 0.5 }, { index: 0, relevance_score: 0.5 },
      { index: 7, relevance_score: 1 }, { index: 2, relevance_score: Number.NaN }, { index: 1, relevance_score: 0.99 },
    ])
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('no usable results → input order unchanged', () => {
    expect(ids(applyRerank(rows, 3, null))).toEqual(ids(rows))
    expect(ids(applyRerank(rows, 3, []))).toEqual(ids(rows))
    expect(parseRerankResults({ nope: 1 }, 3)).toBeNull()
    expect(parseRerankResults({ results: [{ index: '0', relevance_score: 1 }] }, 3)).toBeNull()
  })
})

describe('provider chain', () => {
  it('no key → no fetch, order unchanged', async () => {
    const out = await rerankRows('q', rows, (r) => r.text, { config: cfg() })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ids(out)).toEqual(ids(rows))
  })

  it('disabled via config → no key lookup or fetch', async () => {
    keys.map = { cohere: 'ck' }
    const out = await rerankRows('q', rows, (r) => r.text, { config: rerankConfig({ RAG_RERANK: '0' }) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ids(out)).toEqual(ids(rows))
  })

  it('Cohere success: sends the head only, reorders it and tracks usage', async () => {
    keys.map = { cohere: 'ck', jina: 'jk' }
    fetchMock.mockResolvedValueOnce(ok([{ index: 4, relevance_score: 0.95 }, { index: 0, relevance_score: 0.4 }]))
    const out = await rerankRows('how do refunds work', rows, (r) => r.text, { config: cfg({ candidates: 5 }), userId: 'u1' })
    expect(ids(out)).toEqual(['e', 'a', 'b', 'c', 'd'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.cohere.com/v2/rerank')
    expect(init.headers.Authorization).toBe('Bearer ck')
    expect(JSON.parse(init.body)).toEqual({ model: 'rerank-v3.5', query: 'how do refunds work', documents: rows.map((r) => r.text), top_n: 5 })
    expect(api.trackAiUsage).toHaveBeenCalledWith(expect.objectContaining({ feature: 'rag_rerank', provider: 'cohere', model: 'rerank-v3.5', success: true, user_id: 'u1', kind: 'embedding' }))
  })

  it('candidates caps what is sent; the rest stays after the head', async () => {
    keys.map = { jina: 'jk' }
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, text: `t${i}` }))
    fetchMock.mockResolvedValueOnce(ok([{ index: 4, relevance_score: 0.9 }]))
    const out = await rerankRows('q', many, (r) => r.text, { config: cfg({ candidates: 5 }) })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.jina.ai/v1/rerank')
    expect(body.model).toBe('jina-reranker-v2-base-multilingual')
    expect(body.documents).toHaveLength(5)
    expect(ids(out)).toEqual(['r4', 'r0', 'r1', 'r2', 'r3', 'r5', 'r6', 'r7'])
  })

  it('HTTP error on Cohere falls through to Jina', async () => {
    keys.map = { cohere: 'ck', jina: 'jk' }
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(ok([{ index: 1, relevance_score: 0.7 }]))
    const out = await rerankDocuments('q', ['x', 'y'], { timeoutMs: 3000 })
    expect(out?.provider).toBe('jina')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('every provider failing → unchanged order; 429 marks the key; warnings are rate-limited', async () => {
    keys.map = { cohere: 'ck' }
    fetchMock.mockImplementation(async () => new Response('slow down', { status: 429 }))
    for (let i = 0; i < 3; i++) {
      const out = await rerankRows('q', rows, (r) => r.text, { config: cfg() })
      expect(ids(out)).toEqual(ids(rows))
    }
    expect(api.markRateLimited).toHaveBeenCalledWith('cohere', 'ck', 60_000)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(api.trackAiUsage).toHaveBeenLastCalledWith(expect.objectContaining({ success: false, provider: 'cohere' }))
  })

  it('malformed response → unchanged order', async () => {
    keys.map = { cohere: 'ck' }
    fetchMock.mockResolvedValueOnce(ok('not an array'))
    expect(ids(await rerankRows('q', rows, (r) => r.text, { config: cfg() }))).toEqual(ids(rows))
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    expect(ids(await rerankRows('q', rows, (r) => r.text, { config: cfg() }))).toEqual(ids(rows))
  })

  it('timeout aborts the request → unchanged order', async () => {
    keys.map = { cohere: 'ck' }
    fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const started = Date.now()
    const out = await rerankRows('q', rows, (r) => r.text, { config: cfg({ timeoutMs: 200 }) })
    expect(ids(out)).toEqual(ids(rows))
    expect(Date.now() - started).toBeLessThan(2000)
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/timed out/)
  })

  it('fewer than two rows → no call', async () => {
    keys.map = { cohere: 'ck' }
    expect(ids(await rerankRows('q', rows.slice(0, 1), (r) => r.text, { config: cfg() }))).toEqual(['a'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('rerankAllowed (candidate data stays out of the rerank provider)', () => {
  it('blocks a head with résumés / applicants / attempts / questions unless opted in', async () => {
    const { rerankAllowed } = await import('@/lib/rag/rerank')
    expect(rerankAllowed(['doc', 'problem'], {})).toBe(true)
    for (const t of ['resume', 'ats_application', 'attempt_summary', 'question']) {
      expect(rerankAllowed(['doc', t], {}), t).toBe(false)
      expect(rerankAllowed(['doc', t], { RAG_RERANK_CANDIDATE_DATA: '1' }), t).toBe(true)
    }
  })

  it('rerankRows keeps the fused order (and calls nothing) for candidate data', async () => {
    const { rerankRows } = await import('@/lib/rag/rerank')
    const spy = vi.spyOn(globalThis, 'fetch')
    const rows = [{ id: 'a', source_type: 'doc' }, { id: 'b', source_type: 'resume' }]
    const out = await rerankRows('q', rows, (r) => r.id, { config: { enabled: true, candidates: 30, timeoutMs: 1000 }, env: {} })
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
