/**
 * The offline RAG golden set against BOTH vector stores: ingest the eval corpus
 * into the in-memory Mongo (lib/rag/eval/memory-mongo), score hybrid search
 * with the default Mongo vector path, then backfill into the in-memory pgvector
 * stand-in (lib/rag/eval/memory-pg — it evaluates the real SQL ACL predicate),
 * flip reads and score again. Results and ACL behaviour must match exactly.
 */
import { describe, it, expect, vi } from 'vitest'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'

const h = vi.hoisted(() => ({ db: null as unknown, pg: null as unknown }))

vi.mock('@/lib/mongodb', () => ({ getMongoDb: async () => h.db, getMongoClient: async () => ({}) }))
vi.mock('@/lib/upstash-rate-limit', () => ({ acquireRedisLock: async () => true, releaseRedisLock: async () => {} }))
vi.mock('@/lib/rag/vector-store/pg-pool', () => ({ getPgPool: async () => h.pg }))
vi.mock('@/lib/rag/embed', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/rag/embed')>()
  const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
  return { ...orig, embedTexts: (t: string[]) => localEmbedder.embedTexts(t), availableEmbedModels: () => localEmbedder.availableEmbedModels() }
})

describe('RAG eval: Mongo vs pgvector vector store', () => {
  it('returns the same hits and leaks nothing on either store', async () => {
    const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
    const { MemoryPg } = await import('@/lib/rag/eval/memory-pg')
    const { localEmbedder, LOCAL_EMBED_MODEL } = await import('@/lib/rag/eval/local-embedder')
    const { seedEvalCorpus, EVAL_CALLERS, SYNTHETIC_OWNERS } = await import('@/lib/rag/eval/fixtures')
    const { GOLDEN_QUESTIONS } = await import('@/lib/rag/eval/golden')
    const { runQuestions } = await import('@/lib/rag/eval/runner')
    const { aggregate } = await import('@/lib/rag/eval/metrics')
    const { processKnowledgeQueue, sweepKnowledge } = await import('@/lib/rag/ingest')
    const { searchKnowledge } = await import('@/lib/rag/search')
    const { runBackfill } = await import('@/lib/rag/vector-store/backfill')
    const { resetVectorStoreCaches, vectorReadStore } = await import('@/lib/rag/vector-store')
    const { resetVectorStoreConfigCache } = await import('@/lib/rag/vector-store/config')
    const { SEED_PROBLEMS } = await import('@/lib/db/seed-problems')
    const { SEED_PROBLEMS_BULK } = await import('../scripts/seed-problems-bulk')

    delete process.env.PGVECTOR_URL
    delete process.env.RAG_VECTOR_STORE
    resetVectorStoreConfigCache(); resetVectorStoreCaches()
    const db: MemoryDbT = new MemoryDb()
    h.db = db
    const pg = new MemoryPg()
    h.pg = pg
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await seedEvalCorpus(db, [...SEED_PROBLEMS, ...SEED_PROBLEMS_BULK] as unknown as Record<string, unknown>[])
    localEmbedder.enabled = true
    await sweepKnowledge()
    const ingest = await processKnowledgeQueue({ max: 100_000, budgetMs: 10 * 60_000 })
    expect(ingest.failed).toBe(0)

    const chunks = (await db.collection('rag_chunks').find({}).toArray()) as unknown as { id: string; tenant_id: string | null; visibility: string; source_type: string }[]
    const rowIndex = new Map(chunks.map((c) => [c.id, c]))
    const deps = {
      search: searchKnowledge,
      callerFor: (as: keyof typeof EVAL_CALLERS) => EVAL_CALLERS[as],
      rowsById: async (ids: string[]) => new Map(ids.filter((id) => rowIndex.has(id)).map((id) => [id, rowIndex.get(id)!])),
      owners: SYNTHETIC_OWNERS,
      limit: 10,
    }

    const mongo = await runQuestions(GOLDEN_QUESTIONS, deps)
    expect(pg.log.some((l) => l.tag === 'search')).toBe(false)

    // Configure pgvector, backfill (resumable steps), then reads flip.
    process.env.PGVECTOR_URL = 'postgres://rag:pw@localhost:5432/rag'
    process.env.RAG_VECTOR_STORE = 'pgvector'
    resetVectorStoreConfigCache(); resetVectorStoreCaches()
    expect(await vectorReadStore(LOCAL_EMBED_MODEL)).toBeNull()
    let done = false
    for (let i = 0; i < 50 && !done; i++) {
      const r = await runBackfill({ batchSize: 500, budgetMs: 5_000 })
      done = !r.dry_run && r.done
    }
    expect(done).toBe(true)
    resetVectorStoreCaches()
    expect((await vectorReadStore(LOCAL_EMBED_MODEL))?.kind).toBe('pgvector')
    expect(pg.tables.get('rag_vectors_local_hash_v1')!.rows.size).toBe(chunks.length)

    const pgRes = await runQuestions(GOLDEN_QUESTIONS, deps)
    warn.mockRestore()
    expect(pg.log.filter((l) => l.tag === 'search').length).toBeGreaterThanOrEqual(GOLDEN_QUESTIONS.length)

    const m = aggregate(mongo)
    const p = aggregate(pgRes)
    expect(m.acl_leaks).toBe(0)
    expect(p.acl_leaks).toBe(0)
    for (let i = 0; i < mongo.length; i++) {
      expect(pgRes[i].returned.map((r) => r.key), mongo[i].id).toEqual(mongo[i].returned.map((r) => r.key))
      expect(pgRes[i].leaks).toEqual([])
    }
    expect(p.success).toEqual(m.success)
    expect(p.mrr).toBeCloseTo(m.mrr, 10)
    // Same quality floor as the Mongo offline gate (tests/rag-eval-offline.test.ts).
    expect(p.success[5]).toBeGreaterThanOrEqual(0.88)
  }, 180_000)
})
