import { describe, expect, it } from 'vitest'
import { FUSION_DEFAULTS, fusionConfig, reciprocalRankFusion } from '@/lib/rag/fusion'
import { PUBLIC_ASK_TYPES, canSeePublicChunk } from '@/lib/rag/public'
import { contestSource } from '@/lib/rag/sources/contests'

describe('weighted RRF (RAG-020)', () => {
  it('a keyword-list hit outranks the same rank in the vector list when keyword weighs more', () => {
    const fused = reciprocalRankFusion([['v1', 'x'], ['k1', 'x']], 10, [1, 1.5])
    expect(fused[0].id).toBe('x') // in both lists
    expect(fused[1].id).toBe('k1')
    expect(fused[2].id).toBe('v1')
  })
  it('default weights behave like plain RRF', () => {
    expect(reciprocalRankFusion([['a', 'b'], ['b', 'a']]).map((f) => f.id)).toEqual(['a', 'b'])
  })
  it('default (RAG-020 audit 6) is keyword-first: the top 3 keep the keyword order, vector-only hits are rescued further down', () => {
    const { k, vector, keyword } = FUSION_DEFAULTS
    const kw = Array.from({ length: 25 }, (_, i) => `k${i + 1}`)
    // The vector list loves keyword #3 and #2 and a page the keyword list never saw.
    const vec = ['k3', 'v-only', 'k2']
    const ids = reciprocalRankFusion([vec, kw], k, [vector, keyword]).map((f) => f.id)
    expect(ids.slice(0, 3)).toEqual(['k1', 'k2', 'k3'])
    expect(ids.indexOf('v-only')).toBeGreaterThan(10)
    expect(ids).toContain('v-only')
  })
  it('env overrides are clamped and fall back to the defaults', () => {
    expect(fusionConfig({})).toEqual(FUSION_DEFAULTS)
    expect(fusionConfig({ RAG_RRF_K: '0', RAG_RRF_KEYWORD_WEIGHT: '99', RAG_RRF_VECTOR_WEIGHT: 'x' })).toEqual({ k: 1, keyword: 10, vector: FUSION_DEFAULTS.vector })
  })
})

describe('hosted contests in the knowledge base (RAG-022)', () => {
  const base = { id: 'c1', slug: 'diwali', title: 'Diwali Prompt-a-thon', format: 'prompt_a_thon', status: 'published', visibility: 'public', tenant_id: null, summary: 's', description: 'd', schedule: { starts_at: '2026-11-01T10:00:00Z', ends_at: '2026-11-02T10:00:00Z' }, config: { tasks: [{ id: 't1', title: 'Refund reply', points: 100, eval_cases: 'SECRET', brief: 'hidden brief' }] } }
  it('a published public platform contest is public and links to its page; secrets and briefs are never indexed', () => {
    const s = contestSource(base)!
    expect(s).toMatchObject({ type: 'contest', visibility: 'public', tenant_id: null, url: '/contests/diwali' })
    expect(s.text).toContain('Prompt-a-thon')
    expect(s.text).toContain('Refund reply')
    expect(s.text).not.toContain('SECRET')
    expect(s.text).not.toContain('hidden brief')
  })
  it('drafts and unlisted platform contests are admin only; organisation contests are tenant scoped', () => {
    expect(contestSource({ ...base, status: 'draft' })!.visibility).toBe('platform_admin')
    expect(contestSource({ ...base, visibility: 'unlisted' })!.visibility).toBe('platform_admin')
    expect(contestSource({ ...base, tenant_id: 'acme' })).toMatchObject({ visibility: 'tenant', tenant_id: 'acme' })
  })
  it('public Ask covers platform hackathons, codeathons and contests, only public platform rows', () => {
    for (const t of ['hackathon', 'codeathon', 'contest'] as const) expect(PUBLIC_ASK_TYPES).toContain(t)
    expect(canSeePublicChunk({ tenant_key: '_platform', tenant_id: null, visibility: 'public', source_type: 'contest' })).toBe(true)
    expect(canSeePublicChunk({ tenant_key: 'acme', tenant_id: 'acme', visibility: 'tenant', source_type: 'contest' })).toBe(false)
    expect(canSeePublicChunk({ tenant_key: '_platform', tenant_id: null, visibility: 'platform_admin', source_type: 'hackathon' })).toBe(false)
  })
})
