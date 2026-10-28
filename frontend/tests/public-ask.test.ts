/**
 * "Ask about events & news" (lib/public-ask + lib/rag/public): the public-only
 * ACL can't be widened through request params, the limits / captcha / mode
 * logic, answer cleaning, and the fallback to plain search results.
 */
import { describe, expect, it, vi } from 'vitest'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'
import { PUBLIC_ASK_TYPES, canSeePublicChunk, publicAclFilter, publicTypes } from '@/lib/rag/public'
import { AskBodySchema, askMode, captchaRequired, cleanAnswer, publicCitations, PUBLIC_ASK_LIMITS } from '@/lib/public-ask/policy'
import type { KnowledgeHit } from '@/lib/agent/contract'

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => holder.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/rag/embed', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/rag/embed')>()
  const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
  return { ...orig, embedTexts: (texts: string[]) => localEmbedder.embedTexts(texts), availableEmbedModels: () => localEmbedder.availableEmbedModels() }
})
vi.mock('@/lib/upstash-rate-limit', () => ({ acquireRedisLock: async () => true, releaseRedisLock: async () => {} }))

describe('public ACL (pure)', () => {
  it('requested types can only narrow the public types', () => {
    expect(publicTypes(['resume', 'ats_application', 'test', 'upload'])).toEqual([...PUBLIC_ASK_TYPES])
    expect(publicTypes(['news', 'resume'])).toEqual(['news'])
    expect(publicTypes(undefined)).toEqual([...PUBLIC_ASK_TYPES])
    const f = publicAclFilter(['attempt_summary', { $ne: null }, 'digest'] as unknown[])
    expect(f).toEqual({ tenant_key: '_platform', visibility: 'public', source_type: { $in: ['digest'] } })
    expect(PUBLIC_ASK_TYPES).not.toContain('resume')
  })

  it('row check rejects tenant, admin-only and non-public types', () => {
    expect(canSeePublicChunk({ tenant_key: '_platform', tenant_id: null, visibility: 'public', source_type: 'news' })).toBe(true)
    expect(canSeePublicChunk({ tenant_key: 'acme', tenant_id: 'acme', visibility: 'public', source_type: 'doc' })).toBe(false)
    expect(canSeePublicChunk({ tenant_key: '_platform', tenant_id: null, visibility: 'platform_admin', source_type: 'doc' })).toBe(false)
    expect(canSeePublicChunk({ tenant_key: '_platform', tenant_id: null, visibility: 'public', source_type: 'marketplace_product' })).toBe(false)
  })

  it('request body is strict: no tenant, role, visibility or filter params', () => {
    expect(AskBodySchema.safeParse({ q: 'open hackathons' }).success).toBe(true)
    for (const extra of [{ tenantId: 'acme' }, { tenant_id: 'acme' }, { role: 'superadmin' }, { visibility: 'tenant' }, { filter: { tenant_key: 'acme' } }]) {
      expect(AskBodySchema.safeParse({ q: 'open hackathons', ...extra }).success).toBe(false)
    }
    expect(AskBodySchema.safeParse({ q: 'x' }).success).toBe(false)
    expect(AskBodySchema.safeParse({ q: 'hi', locale: 'fr' }).success).toBe(false)
  })
})

describe('public search over the real pipeline never returns private data', () => {
  it('tenant tests, ATS, résumés and admin docs stay out, whatever types are asked for', async () => {
    const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
    const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
    const { seedEvalCorpus } = await import('@/lib/rag/eval/fixtures')
    const { sweepKnowledge, processKnowledgeQueue } = await import('@/lib/rag/ingest')
    const { searchPublicKnowledge } = await import('@/lib/rag/search')
    const db: MemoryDbT = new MemoryDb()
    holder.db = db
    localEmbedder.enabled = true
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await seedEvalCorpus(db, [])
    await sweepKnowledge()
    await processKnowledgeQueue({ max: 100_000, budgetMs: 120_000 })
    const queries = [
      'which applicants have Terraform and Prometheus experience', 'senior backend engineer payments job description',
      'candidate data retention policy 180 days', 'Priya Raman score integrity flags', 'configure CDN edge caching and redirect rules',
      'online hackathon about carbon and clean energy', 'latest AI news about open model weights', 'moonbase robotics buildathon',
    ]
    const all: KnowledgeHit[] = []
    for (const q of queries) {
      all.push(...await searchPublicKnowledge({ query: q, limit: 10 }))
      all.push(...await searchPublicKnowledge({ query: q, types: ['ats_application', 'resume', 'upload', 'test', 'attempt_summary'], limit: 10 }))
    }
    warn.mockRestore()
    expect(all.length).toBeGreaterThan(0)
    for (const h of all) expect(PUBLIC_ASK_TYPES).toContain(h.source_type)
    const ids = new Set(all.map((h) => `${h.source_type}:${h.source_id}`))
    for (const bad of ['doc:page:admin-help', 'digest:dg_2026-10-19', 'news:np_draft_leak', 'external_event:ef_hidden_spam']) expect(ids.has(bad), bad).toBe(false)
    expect(ids.has('external_event:ef_climate')).toBe(true)
    expect(ids.has('news:np_open_weights')).toBe(true)
  }, 120_000)
})

describe('limits, captcha and mode', () => {
  it('anonymous visitors solve the captcha after the free questions; signed-in users never', () => {
    expect(captchaRequired(false, 0)).toBe(false)
    expect(captchaRequired(false, PUBLIC_ASK_LIMITS.anonFree - 1)).toBe(false)
    expect(captchaRequired(false, PUBLIC_ASK_LIMITS.anonFree)).toBe(true)
    expect(captchaRequired(true, 999)).toBe(false)
  })

  it('falls back to search results when AI is off, capped, over budget, flagged or nothing was found', () => {
    const base = { want: 'ask' as const, aiEnabled: true, aiToday: 0, budgetBlocked: false, flagged: false, hits: 3 }
    expect(askMode(base)).toEqual({ mode: 'ai', fallback: null })
    expect(askMode({ ...base, want: 'search' }).fallback).toBe('search_requested')
    expect(askMode({ ...base, aiEnabled: false }).fallback).toBe('ai_off')
    expect(askMode({ ...base, aiToday: PUBLIC_ASK_LIMITS.dailyAiCap }).fallback).toBe('daily_cap')
    expect(askMode({ ...base, budgetBlocked: true }).fallback).toBe('budget')
    expect(askMode({ ...base, flagged: true }).fallback).toBe('flagged')
    expect(askMode({ ...base, hits: 0 }).fallback).toBe('no_results')
  })

  it('answers keep only valid citations, no URLs; citations are on-site links only', () => {
    expect(cleanAnswer({ answer: 'Climate Hack is open [1]. See https://evil.example [7]' }, 2)).toEqual({ text: 'Climate Hack is open [1]. See ', cited: [1] })
    expect(cleanAnswer({ answer: 'No citations here at all.' }, 2)).toBeNull()
    expect(cleanAnswer('nope', 2)).toBeNull()
    const hit = (url: string | null): KnowledgeHit => ({ chunk_id: 'c', source_type: 'news', source_id: 's', title: 't', url, snippet: '<b>x</b>', score: 1 })
    const c = publicCitations([hit('/news/a'), hit('javascript:alert(1)'), hit('//evil.example'), hit(null), hit('/digest/2026-10-20')])
    expect(c.map((x) => [x.n, x.url])).toEqual([[1, '/news/a'], [2, '/digest/2026-10-20']])
    expect(c[0].snippet).toBe('x')
  })
})

describe('askPublic fallback', () => {
  it('returns plain search results when the budget blocks or the model fails', async () => {
    vi.resetModules()
    const store = new Map<string, number>()
    vi.doMock('@/lib/mongodb', () => ({
      getMongoDb: async () => ({ collection: () => ({
        createIndex: async () => 'ok',
        findOne: async (f: { id: string }) => (store.has(f.id) ? { id: f.id, n: store.get(f.id) } : null),
        findOneAndUpdate: async (f: { id: string }) => { store.set(f.id, (store.get(f.id) || 0) + 1); return { id: f.id, n: store.get(f.id) } },
      }) }),
    }))
    vi.doMock('@/lib/rag/search', () => ({ searchPublicKnowledge: async () => [{ chunk_id: 'c1', source_type: 'digest', source_id: 'dg_2026-10-20', title: 'Daily digest', url: '/digest/2026-10-20', snippet: 'Climate hack open', score: 1 }] }))
    const budget = { blocked: true }
    vi.doMock('@/lib/ai/usage-record', () => ({ aiBudgetBlocks: async () => budget.blocked }))
    vi.doMock('@/lib/ai/backend', () => ({ backendComplete: async () => ({ ok: false }) }))
    vi.doMock('@/lib/interviews/ai-mock-engine', () => ({ platformModelOverrides: async () => ({}), extractJson: () => null }))
    const { askPublic } = await import('@/lib/public-ask/service')
    const r1 = await askPublic('open hackathons', { want: 'ask', locale: 'hi' })
    expect(r1).toMatchObject({ mode: 'search', fallback: 'budget', answer: null })
    expect(r1.results[0]).toMatchObject({ n: 1, url: '/digest/2026-10-20' })
    budget.blocked = false
    const r2 = await askPublic('open hackathons', { want: 'ask', locale: 'en' })
    expect(r2).toMatchObject({ mode: 'search', fallback: 'ai_failed' })
    const r3 = await askPublic('open hackathons', { want: 'search', locale: 'en' })
    expect(r3.fallback).toBe('search_requested')
    for (const m of ['@/lib/mongodb', '@/lib/rag/search', '@/lib/ai/usage-record', '@/lib/ai/backend', '@/lib/interviews/ai-mock-engine']) vi.doUnmock(m)
  })
})
