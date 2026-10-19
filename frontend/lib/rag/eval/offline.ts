/**
 * Offline evaluation: seed the in-memory index with real product content
 * (seed problems, docs/FAQ/legal/admin help) + the synthetic organisations,
 * ingest through the REAL pipeline (sweepKnowledge → processKnowledgeQueue →
 * loaders → chunkText → store), then run the golden set through the REAL
 * searchKnowledge in two modes:
 *
 *   keyword  no embeddings at query time ($text only, like a deployment without an embedding key)
 *   hybrid   deterministic local embedder (./local-embedder) → vector list + RRF fusion
 *
 * The caller must route `@/lib/mongodb` to `db` and `@/lib/rag/embed` to
 * `localEmbedder` (see tests/rag-eval-offline.test.ts) — production code is untouched.
 */
import { approxTokens } from '../chunk'
import { processKnowledgeQueue, sweepKnowledge } from '../ingest'
import { searchKnowledge } from '../search'
import { KNOWLEDGE_SOURCE_TYPES, type RagChunkDoc, type RagSourceDoc } from '../types'
import { EVAL_CALLERS, SYNTHETIC_OWNERS, seedEvalCorpus } from './fixtures'
import { GOLDEN_QUESTIONS, type GoldenQuestion } from './golden'
import type { MemoryDb } from './memory-mongo'
import { aggregate, percentile, plainSummary, type AggregateMetrics, type QuestionResult } from './metrics'
import { runQuestions, type ChunkAclRow, type RunDeps } from './runner'

export interface ChunkStats {
  chunks: number
  sources: number
  embedded_chunks: number
  avg_tokens: number
  p50_tokens: number
  p95_tokens: number
  max_tokens: number
  multi_chunk_sources: number
  by_type: { type: string; sources: number; chunks: number; avg_tokens: number; max_chunks_per_source: number }[]
}

export interface CoverageRow { type: string; listed: number; indexed: number; failed: number; missing: string[] }

export interface ModeReport { metrics: AggregateMetrics; summary: string[]; results: QuestionResult[] }

export interface ExperimentRow {
  name: string
  description: string
  keyword: Pick<AggregateMetrics, 'success' | 'mrr' | 'ndcg10' | 'acl_leaks'>
  hybrid: Pick<AggregateMetrics, 'success' | 'mrr' | 'ndcg10' | 'acl_leaks'>
}

export interface OfflineReport {
  generated_at: string
  questions: number
  chunk_stats: ChunkStats
  coverage: { listed: number; indexed: number; rate: number; by_type: CoverageRow[] }
  ingest: { processed: number; failed: number; ms: number }
  modes: { keyword: ModeReport; hybrid: ModeReport }
  /** What-if runs (eval-only knobs; production ranking unchanged). */
  experiments: ExperimentRow[]
}

/** Keep at most `max` hits of each listed type, letting the next results move up (simulates a diversity rule). */
export function capPerType<T extends { source_type: string }>(hits: readonly T[], caps: Record<string, number>): T[] {
  const seen: Record<string, number> = {}
  return hits.filter((h) => {
    const cap = caps[h.source_type]
    if (cap === undefined) return true
    seen[h.source_type] = (seen[h.source_type] ?? 0) + 1
    return seen[h.source_type] <= cap
  })
}

type Doc = Record<string, unknown>

export function chunkStats(chunks: readonly RagChunkDoc[]): ChunkStats {
  const toks = chunks.map((c) => approxTokens(c.text))
  const bySource = new Map<string, number>()
  for (const c of chunks) bySource.set(`${c.source_type}:${c.source_id}`, (bySource.get(`${c.source_type}:${c.source_id}`) ?? 0) + 1)
  const types = [...new Set(chunks.map((c) => c.source_type))]
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0)
  return {
    chunks: chunks.length,
    sources: bySource.size,
    embedded_chunks: chunks.filter((c) => Array.isArray(c.embedding) && c.embedding.length).length,
    avg_tokens: avg(toks),
    p50_tokens: percentile(toks, 50),
    p95_tokens: percentile(toks, 95),
    max_tokens: Math.max(0, ...toks),
    multi_chunk_sources: [...bySource.values()].filter((n) => n > 1).length,
    by_type: types.map((t) => {
      const cs = chunks.filter((c) => c.source_type === t)
      const per = [...bySource.entries()].filter(([k]) => k.startsWith(`${t}:`)).map(([, n]) => n)
      return { type: t, sources: per.length, chunks: cs.length, avg_tokens: avg(cs.map((c) => approxTokens(c.text))), max_chunks_per_source: Math.max(0, ...per) }
    }),
  }
}

export async function runOfflineEval(opts: {
  db: MemoryDb
  problems: readonly Doc[]
  setVectors: (on: boolean) => void
  questions?: readonly GoldenQuestion[]
}): Promise<OfflineReport> {
  const { db } = opts
  const questions = opts.questions ?? GOLDEN_QUESTIONS
  await seedEvalCorpus(db, opts.problems)

  // Ingest with vectors on, through the real sweep + queue.
  opts.setVectors(true)
  const t0 = performance.now()
  const sweep = await sweepKnowledge()
  const ingest = await processKnowledgeQueue({ max: 100_000, budgetMs: 10 * 60_000 })
  const ingestMs = Math.round(performance.now() - t0)

  const chunks = (await db.collection('rag_chunks').find({}).toArray()) as unknown as RagChunkDoc[]
  const sources = (await db.collection('rag_sources').find({}).toArray()) as unknown as RagSourceDoc[]
  const byType: CoverageRow[] = KNOWLEDGE_SOURCE_TYPES.map((t) => {
    const rows = sources.filter((s) => s.type === t)
    return {
      type: t,
      listed: sweep.byType[t] ?? 0,
      indexed: rows.filter((s) => s.status === 'ready' && (s.chunk_count ?? 0) > 0).length,
      failed: rows.filter((s) => s.status === 'failed').length,
      missing: rows.filter((s) => s.status !== 'ready').map((s) => s.id).slice(0, 10),
    }
  }).filter((r) => r.listed || r.indexed)
  const listed = byType.reduce((n, r) => n + r.listed, 0)
  const indexed = byType.reduce((n, r) => n + r.indexed, 0)

  const rowIndex = new Map(chunks.map((c) => [c.id, c as ChunkAclRow]))
  const deps: RunDeps = {
    search: searchKnowledge,
    callerFor: (as) => EVAL_CALLERS[as],
    rowsById: async (ids: string[]) => new Map(ids.filter((id) => rowIndex.has(id)).map((id) => [id, rowIndex.get(id)!])),
    owners: SYNTHETIC_OWNERS,
    limit: 10,
  }

  const runMode = async (vectors: boolean): Promise<ModeReport> => {
    opts.setVectors(vectors)
    const results = await runQuestions(questions, deps)
    const metrics = aggregate(results)
    return { metrics, summary: plainSummary(metrics), results }
  }
  const keyword = await runMode(false)
  const hybrid = await runMode(true)

  // ── What-if experiments ───────────────────────────────────────────────────
  const pick = (m: AggregateMetrics) => ({ success: m.success, mrr: m.mrr, ndcg10: m.ndcg10, acl_leaks: m.acl_leaks })
  const experiments: ExperimentRow[] = []
  const experiment = async (name: string, description: string, setup: () => void, teardown: () => void, search = searchKnowledge) => {
    setup()
    const prev = deps.search
    deps.search = search
    const rows: Record<'keyword' | 'hybrid', AggregateMetrics> = {} as never
    for (const [label, vectors] of [['keyword', false], ['hybrid', true]] as const) {
      opts.setVectors(vectors)
      rows[label] = aggregate(await runQuestions(questions, deps))
    }
    deps.search = prev
    teardown()
    experiments.push({ name, description, keyword: pick(rows.keyword), hybrid: pick(rows.hybrid) })
  }
  const chunkCol = db.collection('rag_chunks')
  const baseWeights = chunkCol.textWeights ?? { title: 1, text: 1 }
  for (const w of [5, 2, 1].filter((x) => x !== baseWeights.title)) {
    await experiment(`title weight ${w}`, `rag_chunks text index weights { title: ${w}, text: 1 } instead of { title: ${baseWeights.title}, text: ${baseWeights.text} }`,
      () => chunkCol.setTextWeights({ title: w }), () => chunkCol.setTextWeights(baseWeights))
  }
  await experiment('cap candidate summaries', 'at most 2 attempt summaries and 2 résumés per result list (fetch 20, cap, keep 10)',
    () => {}, () => {},
    async (args) => capPerType(await searchKnowledge({ ...args, limit: 20 }), { attempt_summary: 2, resume: 2 }).slice(0, args.limit ?? 10))

  return {
    generated_at: new Date().toISOString(),
    questions: questions.length,
    chunk_stats: chunkStats(chunks),
    coverage: { listed, indexed, rate: listed ? Math.round((indexed / listed) * 1000) / 1000 : 0, by_type: byType },
    ingest: { processed: ingest.processed, failed: ingest.failed, ms: ingestMs },
    modes: { keyword, hybrid },
    experiments,
  }
}

// ─── Text table for the console ──────────────────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function formatReport(r: OfflineReport): string {
  const k = r.modes.keyword.metrics
  const h = r.modes.hybrid.metrics
  const row = (label: string, a: string, b: string) => `| ${label.padEnd(26)} | ${a.padStart(12)} | ${b.padStart(16)} |`
  const lines = [
    `RAG offline evaluation — ${r.questions} golden questions (${k.positives} with expected sources, ${k.acl_queries} ACL negatives)`,
    '',
    row('Metric', 'Keyword only', 'Hybrid (local emb)'),
    `|${'-'.repeat(28)}|${'-'.repeat(14)}|${'-'.repeat(18)}|`,
    ...([1, 3, 5, 10] as const).map((n) => row(`Success@${n} (any right src)`, pct(k.success[n]), pct(h.success[n]))),
    ...([1, 3, 5, 10] as const).map((n) => row(`Recall@${n}`, pct(k.recall[n]), pct(h.recall[n]))),
    row('MRR', k.mrr.toFixed(3), h.mrr.toFixed(3)),
    row('nDCG@10', k.ndcg10.toFixed(3), h.ndcg10.toFixed(3)),
    row('ACL leaks (must be 0)', String(k.acl_leaks), String(h.acl_leaks)),
    row('Latency p50 / p95 (ms)', `${k.latency_ms.p50} / ${k.latency_ms.p95}`, `${h.latency_ms.p50} / ${h.latency_ms.p95}`),
    row('Duplicate-hit rate', pct(k.duplicate_hit_rate), pct(h.duplicate_hit_rate)),
    '',
    'Success@5 by source type (keyword → hybrid):',
    ...k.by_type.map((t) => {
      const hb = h.by_type.find((x) => x.type === t.type)
      return `  ${t.type.padEnd(20)} n=${String(t.questions).padStart(2)}  ${pct(t.success_at_5).padStart(6)} → ${pct(hb?.success_at_5 ?? 0).padStart(6)}   MRR ${t.mrr.toFixed(2)} → ${(hb?.mrr ?? 0).toFixed(2)}`
    }),
    '',
    'By question kind (success@3, keyword → hybrid):',
    ...k.by_kind.map((t) => {
      const hb = h.by_kind.find((x) => x.kind === t.kind)
      return `  ${t.kind.padEnd(14)} n=${String(t.questions).padStart(2)}  ${pct(t.success_at_3).padStart(6)} → ${pct(hb?.success_at_3 ?? 0).padStart(6)}`
    }),
    '',
    `Chunks: ${r.chunk_stats.chunks} from ${r.chunk_stats.sources} sources · avg ${r.chunk_stats.avg_tokens} tokens (p50 ${r.chunk_stats.p50_tokens}, p95 ${r.chunk_stats.p95_tokens}, max ${r.chunk_stats.max_tokens}) · ${r.chunk_stats.multi_chunk_sources} sources span >1 chunk`,
    `Index coverage: ${r.coverage.indexed}/${r.coverage.listed} sources (${pct(r.coverage.rate)}) · ingest ${r.ingest.processed} ok, ${r.ingest.failed} failed in ${r.ingest.ms} ms`,
    ...r.coverage.by_type.map((c) => `  ${c.type.padEnd(20)} ${c.indexed}/${c.listed}${c.failed ? ` (${c.failed} failed)` : ''}`),
    '',
    'What-if experiments (success@3 / MRR, keyword → hybrid; production unchanged):',
    `  ${'baseline'.padEnd(26)} ${pct(k.success[3])} / ${k.mrr.toFixed(3)} → ${pct(h.success[3])} / ${h.mrr.toFixed(3)}`,
    ...r.experiments.map((e) => `  ${e.name.padEnd(26)} ${pct(e.keyword.success[3])} / ${e.keyword.mrr.toFixed(3)} → ${pct(e.hybrid.success[3])} / ${e.hybrid.mrr.toFixed(3)}${e.keyword.acl_leaks + e.hybrid.acl_leaks ? '  ACL LEAK' : ''}`),
    '',
    'Hybrid, in plain words:',
    ...r.modes.hybrid.summary.map((s) => `  ${s}`),
    '',
    `Missed in top 5 (keyword): ${k.failed.map((f) => f.id).join(', ') || 'none'}`,
    `Missed in top 5 (hybrid):  ${h.failed.map((f) => f.id).join(', ') || 'none'}`,
  ]
  return lines.join('\n')
}
