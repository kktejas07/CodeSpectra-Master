/**
 * RAG evaluation harness (lib/rag/eval): stemmer, the in-memory $text
 * emulation, the local embedder, metrics, the golden set's integrity, live
 * eligibility, index health, and the JSX docs-extractor fix.
 */
import { describe, it, expect, vi } from 'vitest'

const holder = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => holder.db, getMongoClient: async () => ({}) }))

import { stem, textIndexTerms } from '@/lib/rag/eval/stemmer'
import { MemoryDb, parseTextSearch } from '@/lib/rag/eval/memory-mongo'
import { localEmbed, LOCAL_EMBED_DIMS } from '@/lib/rag/eval/local-embedder'
import { aggregate, oracleCanSee, ownerAllows, percentile, plainSummary, scoreQuestion } from '@/lib/rag/eval/metrics'
import { GOLDEN_QUESTIONS, type GoldenQuestion } from '@/lib/rag/eval/golden'
import { SYNTHETIC_OWNERS, TENANT_A, TENANT_B } from '@/lib/rag/eval/fixtures'
import { eligibleQuestions } from '@/lib/rag/eval/live'
import { capPerType } from '@/lib/rag/eval/offline'
import { cosine } from '@/lib/rag/fusion'
import { KNOWLEDGE_SOURCE_TYPES } from '@/lib/rag/types'
import { jsxPageToMarkdown, listDocIds, listInternalDocIds } from '@/lib/rag/sources/docs'
import { SEED_PROBLEMS } from '@/lib/db/seed-problems'
import { SEED_PROBLEMS_BULK } from '../scripts/seed-problems-bulk'
import type { AgentCaller } from '@/lib/agent/contract'

const SUPER: AgentCaller = { userId: 's', role: 'superadmin', tenantId: null }
const A: AgentCaller = { userId: 'a', role: 'tenant_admin', tenantId: TENANT_A }

describe('Snowball English stemmer', () => {
  it('matches reference Porter2 output', () => {
    const cases: Record<string, string> = {
      caresses: 'caress', ponies: 'poni', cats: 'cat', running: 'run', hopping: 'hop', generously: 'generous',
      knightly: 'knight', happiness: 'happi', relational: 'relat', conditional: 'condit', agreed: 'agre',
      skies: 'sky', dying: 'die', news: 'news', communication: 'communic', generate: 'generat', flies: 'fli', abilities: 'abil',
    }
    for (const [w, s] of Object.entries(cases)) expect(stem(w), w).toBe(s)
  })

  it('tokenises like a MongoDB English text index (stop words out, diacritics folded)', () => {
    expect(textIndexTerms('What gets recorded in the audit trail?')).toEqual(['get', 'record', 'audit', 'trail'])
    expect(textIndexTerms('Résumé')).toEqual(['resum'])
  })
})

describe('in-memory $text emulation', () => {
  it('scores with MongoDB’s formula and field weights', async () => {
    const col = new MemoryDb().collection('c')
    await col.createIndex({ title: 'text', text: 'text' }, { weights: { title: 5, text: 1 } })
    // title: [two, sum] → 5 · 1 · (0.5·1/2 + 0.5) = 3.75; text: [two, number, add] → 1 · (0.5/3 + 0.5) ≈ 0.667
    expect(col.textScore({ title: 'Two Sum', text: 'two numbers add' }, 'two')).toBeCloseTo(3.75 + 0.5 / 3 + 0.5, 6)
    // Repeats saturate: freq = 1 + 1/2.
    expect(col.textScore({ title: '', text: 'cache cache' }, 'cache')).toBeCloseTo(1.5 * 1, 6)
  })

  it('ORs terms, honours -negation and "phrases", and sorts by textScore', async () => {
    const col = new MemoryDb().collection('c')
    await col.createIndex({ title: 'text', text: 'text' }, { weights: { title: 5, text: 1 } })
    await col.insertMany([
      { id: 'a', title: 'Merge intervals', text: 'combine overlapping ranges' },
      { id: 'b', title: 'Merge sorted lists', text: 'linked list merge' },
      { id: 'c', title: 'Coin change', text: 'fewest coins' },
    ])
    const q = (s: string) => col.find({ $text: { $search: s } }, { projection: { id: 1, score: { $meta: 'textScore' } } }).sort({ score: { $meta: 'textScore' } }).toArray()
    expect((await q('merge')).map((r) => r.id).sort()).toEqual(['a', 'b'])
    expect((await q('merge -lists')).map((r) => r.id)).toEqual(['a'])
    expect((await q('"overlapping ranges" merge')).map((r) => r.id)).toEqual(['a'])
    expect((await q('coins ranges')).length).toBe(2)
    const ranked = await q('merge linked list')
    expect(ranked[0].id).toBe('b')
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score)
    expect(parseTextSearch('the cats -dogs').terms).toEqual(['cat'])
  })

  it('supports the operators the RAG code uses', async () => {
    const col = new MemoryDb().collection('c')
    await col.insertMany([{ id: '1', t: null, n: 2, s: 'x', arr: ['a'] }, { id: '2', t: 'acme', n: 5 }])
    expect(await col.countDocuments({ t: null })).toBe(1)
    expect(await col.countDocuments({ t: { $type: 'string' } })).toBe(1)
    expect(await col.countDocuments({ $or: [{ n: { $gt: 4 } }, { arr: 'a' }] })).toBe(2)
    await col.bulkWrite([{ updateOne: { filter: { id: '3' }, update: { $set: { n: 1 }, $setOnInsert: { id: '3' } }, upsert: true } }])
    expect(await col.findOne({ id: '3' }, { projection: { _id: 0, n: 1 } })).toEqual({ n: 1 })
    const g = await col.aggregate([{ $group: { _id: null, total: { $sum: '$n' }, big: { $sum: { $cond: [{ $gt: ['$n', 1] }, 1, 0] } } } }]).toArray()
    expect(g).toEqual([{ _id: null, total: 8, big: 2 }])
  })
})

describe('local embedder (eval only)', () => {
  it('is deterministic, normalised and lexical', () => {
    const a = localEmbed('least recently used cache eviction')
    expect(a).toHaveLength(LOCAL_EMBED_DIMS)
    expect(localEmbed('least recently used cache eviction')).toEqual(a)
    expect(Math.sqrt(a.reduce((s, x) => s + x * x, 0))).toBeCloseTo(1, 6)
    expect(cosine(a, localEmbed('LRU cache that evicts the least recently used item'))).toBeGreaterThan(cosine(a, localEmbed('count prime numbers below n')))
  })
})

describe('metrics', () => {
  const q = (expect: string[], all = false): GoldenQuestion => ({ id: 'q', query: 'x', as: 'superadmin', kind: 'paraphrase', type: 'doc', fixture: 'real', expect, all })
  const hits = (...keys: string[]) => keys.map((key) => ({ key, type: 'doc', title: key, score: 1 }))

  it('scores ranks, recall, reciprocal rank and nDCG', () => {
    const r = scoreQuestion(q(['b', 'z']), hits('a', 'b', 'c'), 5, [])
    expect(r.ranks).toEqual([2, 0])
    expect(r.success[1]).toBe(false)
    expect(r.success[3]).toBe(true)
    expect(r.recall[3]).toBe(0.5)
    expect(r.rr).toBe(0.5)
    expect(r.ndcg10).toBeCloseTo((1 / Math.log2(3)) / (1 + 1 / Math.log2(3)), 6)
    const multi = scoreQuestion(q(['a', 'c'], true), hits('a', 'b', 'c'), 1, [])
    expect(multi.success[1]).toBe(false)
    expect(multi.success[3]).toBe(true)
  })

  it('aggregates, counts leaks and duplicates, and explains in plain words', () => {
    const results = [
      scoreQuestion(q(['a']), hits('a', 'b'), 4, []),
      scoreQuestion(q(['x']), hits('a', 'a'), 8, [{ key: 'a', reason: 'test' }]),
      scoreQuestion({ ...q([]), kind: 'acl_negative' }, [], 2, []),
    ]
    const m = aggregate(results)
    expect(m.positives).toBe(2)
    expect(m.success[1]).toBe(0.5)
    expect(m.mrr).toBe(0.5)
    expect(m.acl_leaks).toBe(1)
    expect(m.duplicate_hit_rate).toBe(0.25)
    expect(m.failed.map((f) => f.id)).toEqual(['q'])
    const text = plainSummary(m)
    expect(text[0]).toBe('1 of 2 questions found the right source in the top 3 results.')
    expect(text[3]).toMatch(/FAILED/)
    expect(percentile([1, 2, 3, 4], 50)).toBe(2)
  })

  it('ACL oracle mirrors the access rule independently', () => {
    expect(oracleCanSee(SUPER, { tenant_id: 'globex', visibility: 'tenant' })).toBe(true)
    expect(oracleCanSee(SUPER, { tenant_id: 'globex', visibility: 'tenant' }, 'acme')).toBe(false)
    expect(oracleCanSee(A, { tenant_id: 'acme', visibility: 'tenant', source_type: 'resume' })).toBe(true)
    expect(oracleCanSee(A, { tenant_id: 'globex', visibility: 'tenant' })).toBe(false)
    expect(oracleCanSee(A, { tenant_id: null, visibility: 'public', source_type: 'doc' })).toBe(true)
    expect(oracleCanSee(A, { tenant_id: null, visibility: 'platform_admin', source_type: 'doc' })).toBe(false)
    expect(oracleCanSee(A, { tenant_id: null, visibility: 'public', source_type: 'question' })).toBe(false)
    expect(ownerAllows(A, { tenant: TENANT_B, adminOnly: false }, 'test')).toBe(false)
    expect(ownerAllows(A, { tenant: null, adminOnly: false }, 'course')).toBe(true)
  })

  it('caps candidate summaries without touching other hits', () => {
    const h = ['attempt_summary', 'doc', 'attempt_summary', 'attempt_summary', 'resume'].map((t, i) => ({ source_type: t, i }))
    expect(capPerType(h, { attempt_summary: 2 }).map((x) => x.i)).toEqual([0, 1, 2, 4])
  })
})

describe('golden set', () => {
  it('is large, unique and covers every source type and ACL negatives', () => {
    expect(GOLDEN_QUESTIONS.length).toBeGreaterThanOrEqual(60)
    expect(new Set(GOLDEN_QUESTIONS.map((q) => q.id)).size).toBe(GOLDEN_QUESTIONS.length)
    const types = new Set(GOLDEN_QUESTIONS.filter((q) => q.expect.length).flatMap((q) => q.expect.map((k) => k.split(':')[0])))
    for (const t of KNOWLEDGE_SOURCE_TYPES) expect(types.has(t), t).toBe(true)
    const negatives = GOLDEN_QUESTIONS.filter((q) => q.kind === 'acl_negative')
    expect(negatives.length).toBeGreaterThanOrEqual(8)
    for (const n of negatives) { expect(n.expect).toEqual([]); expect(n.forbid?.length).toBeGreaterThan(0); expect(n.as).not.toBe('superadmin') }
    expect(GOLDEN_QUESTIONS.filter((q) => q.kind === 'multi_hop').length).toBeGreaterThanOrEqual(4)
  })

  it('points at sources that really exist', async () => {
    const problems = new Set([...SEED_PROBLEMS, ...SEED_PROBLEMS_BULK].map((p) => `problem:${p.id}`))
    const docs = new Set([...(await listDocIds()).map((id) => `doc:${id}`), ...(await listInternalDocIds()).map((id) => `dev_doc:${id}`)])
    for (const q of GOLDEN_QUESTIONS) {
      for (const k of [...q.expect, ...(q.forbid ?? [])]) {
        if (q.fixture === 'real') expect(problems.has(k) || docs.has(k), `${q.id} → ${k}`).toBe(true)
        else expect(SYNTHETIC_OWNERS[k] || problems.has(k) || docs.has(k), `${q.id} → ${k}`).toBeTruthy()
      }
    }
  })

  it('does not copy source titles word for word (paraphrases)', () => {
    const titles = [...SEED_PROBLEMS, ...SEED_PROBLEMS_BULK].map((p) => p.title.toLowerCase())
    for (const q of GOLDEN_QUESTIONS.filter((x) => x.kind === 'paraphrase')) {
      expect(titles.some((t) => q.query.toLowerCase().includes(t)), q.id).toBe(false)
    }
  })

  it('live run keeps only real questions whose sources are indexed', () => {
    const indexed = new Set(['problem:p_two_sum', 'doc:docs:public/pricing', 'doc:page:admin-help'])
    const { run, skipped } = eligibleQuestions(GOLDEN_QUESTIONS, indexed)
    expect(run.map((q) => q.id).sort()).toEqual(['acl-11', 'dc-01', 'dc-23', 'dc-26', 'pr-01'])
    expect(run.find((q) => q.id === 'dc-23')!.expect).toEqual(['doc:page:admin-help']) // trimmed to what's indexed
    expect(skipped.some((s) => s.id === 'pr-25' && s.reason === 'expected source not indexed')).toBe(true) // multi-hop needs all
    expect(skipped.some((s) => s.reason === 'offline fixture')).toBe(true)
  })
})

describe('index health', () => {
  it('summarises status, failures, staleness and embedding mix', async () => {
    const db = new MemoryDb()
    holder.db = db
    const now = new Date('2026-10-19T00:00:00Z')
    await db.collection('rag_sources').insertMany([
      { id: 'doc:a', type: 'doc', source_id: 'a', title: 'A', status: 'ready', chunk_count: 2, indexed_at: '2026-10-18T00:00:00Z', embedding_model: 'm1' },
      { id: 'doc:b', type: 'doc', source_id: 'b', title: 'B', status: 'ready', chunk_count: 1, indexed_at: '2026-09-01T00:00:00Z', embedding_missing: true },
      { id: 'test:c', type: 'test', source_id: 'c', title: 'C', status: 'failed', error: 'boom', chunk_count: 0, updated_at: '2026-10-17T00:00:00Z' },
      { id: 'test:d', type: 'test', source_id: 'd', title: 'D', status: 'indexing', locked_until: '2026-10-18T00:00:00Z', chunk_count: 0 },
    ])
    await db.collection('rag_chunks').insertMany([
      { id: 'doc:a:0', text: 'x'.repeat(400), embedding_model: 'm1' },
      { id: 'doc:a:1', text: 'x'.repeat(800), embedding_model: 'm1' },
      { id: 'doc:b:0', text: 'x'.repeat(40) },
    ])
    const { indexHealth } = await import('@/lib/rag/eval/health')
    const h = await indexHealth(now)
    expect(h.sources).toBe(4)
    expect(h.by_status).toEqual({ ready: 2, failed: 1, indexing: 1 })
    expect(h.failed).toEqual([{ id: 'test:c', type: 'test', title: 'C', error: 'boom', updated_at: '2026-10-17T00:00:00Z' }])
    expect(h.stale.count).toBe(1)
    expect(h.stale.sample[0].id).toBe('doc:b')
    expect(h.stuck_indexing).toBe(1)
    expect(h.embedding_models).toEqual([{ model: 'm1', chunks: 2, avg_tokens: 150 }, { model: null, chunks: 1, avg_tokens: 10 }])
    expect(h.chunks_without_embeddings).toBe(1)
    expect(h.sources_keyword_only).toBe(1)
    expect(h.by_type.map((t) => t.type)).toEqual(['doc', 'test'])
  })
})

describe('JSX page extraction (docs source) — fix found by the evaluation', () => {
  const src = `export default function P() { return (
    <Wrapper>
      <PageHero
        title="Security"
        lead="How we protect accounts."
        actions={<><Link href="/support" className={x}>Report a vulnerability</Link></>}
        art={<HeroIllustration name="shield" />}
      />
      <BentoTitle>Third-party sign-in</BentoTitle>
      <BentoBody>We use OAuth.</BentoBody>
      <h2 className="flex">
        <Bug className="h-5 w-5" aria-hidden /> Reporting a vulnerability
      </h2>
      <p>Use the support page.</p>
    </Wrapper>
  ) }`

  it('keeps multi-line headings, *Title components and hero copy; drops markup leftovers', () => {
    const md = jsxPageToMarkdown(src)
    expect(md).toContain('## Reporting a vulnerability')
    expect(md).toContain('### Third-party sign-in')
    expect(md).toContain('How we protect accounts.')
    expect(md).not.toMatch(/^#+\s*$/m) // no empty headings
    expect(md).not.toMatch(/^-\s*$/m) // <Link> is not a list item
    expect(md).not.toContain('art=')
  })
})
