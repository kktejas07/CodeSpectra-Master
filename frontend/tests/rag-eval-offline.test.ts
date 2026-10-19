/**
 * Offline RAG evaluation: the real ingest + search code over an in-memory
 * MongoDB (lib/rag/eval/memory-mongo.ts, with a MongoDB-style $text emulation)
 * and a deterministic local embedder for the hybrid path.
 *
 *   npx tsx lib/rag/eval/run-offline.ts            # prints the table + writes JSON
 *   RAG_EVAL_PRINT=1 RAG_EVAL_OUT=/tmp/x.json npx vitest run tests/rag-eval-offline.test.ts
 *
 * As a regular test it guards: zero ACL leaks, full index coverage, and a
 * floor under retrieval quality so ranking changes can't silently regress.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { MemoryDb as MemoryDbT } from '@/lib/rag/eval/memory-mongo'

const holder = vi.hoisted(() => ({ db: null as unknown }))

vi.mock('@/lib/mongodb', () => ({
  getMongoDb: async () => holder.db,
  getMongoClient: async () => ({}),
}))
vi.mock('@/lib/rag/embed', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/rag/embed')>()
  const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
  return {
    ...orig,
    embedTexts: (texts: string[]) => localEmbedder.embedTexts(texts),
    availableEmbedModels: () => localEmbedder.availableEmbedModels(),
  }
})
vi.mock('@/lib/upstash-rate-limit', () => ({
  acquireRedisLock: async () => true,
  releaseRedisLock: async () => {},
}))

describe('RAG offline evaluation', () => {
  it('ingests the corpus through the real pipeline and scores the golden set', async () => {
    const { MemoryDb } = await import('@/lib/rag/eval/memory-mongo')
    const { localEmbedder } = await import('@/lib/rag/eval/local-embedder')
    const { runOfflineEval, formatReport } = await import('@/lib/rag/eval/offline')
    const { SEED_PROBLEMS } = await import('@/lib/db/seed-problems')
    const { SEED_PROBLEMS_BULK } = await import('../scripts/seed-problems-bulk')

    const db: MemoryDbT = new MemoryDb()
    holder.db = db
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const report = await runOfflineEval({
      db,
      problems: [...SEED_PROBLEMS, ...SEED_PROBLEMS_BULK] as unknown as Record<string, unknown>[],
      setVectors: (on) => { localEmbedder.enabled = on },
    })
    warn.mockRestore()

    if (process.env.RAG_EVAL_OUT) {
      const out = path.resolve(process.env.RAG_EVAL_OUT)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.writeFileSync(out, JSON.stringify(report, null, 2))
    }
    if (process.env.RAG_EVAL_PRINT) console.log(`\n${formatReport(report)}\n`)

    const { keyword, hybrid } = report.modes
    // Access control is absolute.
    expect(keyword.metrics.acl_leaks).toBe(0)
    expect(hybrid.metrics.acl_leaks).toBe(0)
    // Everything the sweep finds gets indexed.
    expect(report.ingest.failed).toBe(0)
    expect(report.coverage.rate).toBe(1)
    expect(report.chunk_stats.embedded_chunks).toBe(report.chunk_stats.chunks)
    // One hit per source.
    expect(hybrid.metrics.duplicate_hit_rate).toBe(0)
    // Quality floors (measured values sit above these; see the report).
    expect(keyword.metrics.success[5]).toBeGreaterThanOrEqual(0.75)
    expect(hybrid.metrics.success[5]).toBeGreaterThanOrEqual(0.8)
    expect(hybrid.metrics.mrr).toBeGreaterThanOrEqual(0.6)
  }, 120_000)
})
