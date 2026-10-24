/**
 * Live evaluation (superadmin): run the golden questions whose sources exist
 * in the live index through the real searchKnowledge (real embeddings when a
 * key is configured), plus ACL probes against real organisations, and store
 * the run in `rag_eval_runs`.
 *
 * Questions marked "as a company admin" run as a probe tenant that owns
 * nothing ('rag-eval-probe'), so they can only see public platform content —
 * strictly less access than the superadmin who started the run.
 *
 * Stored runs never contain candidate names: titles of résumé / attempt hits
 * are replaced with their type label, and ACL probes keep only source ids.
 */
import { randomUUID } from 'crypto'
import type { Collection } from 'mongodb'
import type { AgentCaller } from '@/lib/agent/contract'
import { getMongoDb } from '@/lib/mongodb'
import { availableEmbedModels } from '../embed'
import { dominantEmbeddingModel } from '../ingest'
import { searchKnowledge } from '../search'
import { ragChunks, ragSources } from '../store'
import { SOURCE_TYPE_LABELS, type KnowledgeSourceType } from '../types'
import { ANSWER_TOP_K, CANDIDATE_TYPES, answerQualitySummary, runAnswerQuality, type AnswerInput, type AnswerQualityReport } from './answer-quality'
import { GOLDEN_QUESTIONS, type EvalAs, type GoldenQuestion } from './golden'
import { indexHealth, type IndexHealth } from './health'
import { aggregate, oracleCanSee, plainSummary, type AggregateMetrics, type QuestionResult } from './metrics'
import { hitKey, runQuestions, type ChunkAclRow, type RunDeps } from './runner'

export const EVAL_RUNS_COLLECTION = 'rag_eval_runs'
export const PROBE_TENANT = 'rag-eval-probe'
const MAX_PROBE_TENANTS = 3
const PROBES_PER_TENANT = 6
const MASKED_TYPES = CANDIDATE_TYPES // résumé, attempt summary, ATS application

export interface EvalRunDoc {
  id: string
  at: string
  by: string
  mode: 'live'
  duration_ms: number
  embedding: { available: string[]; corpus_model: string | null }
  questions_total: number
  questions_run: number
  skipped: { id: string; reason: string }[]
  metrics: Omit<AggregateMetrics, 'failed'>
  summary: string[]
  failed: { id: string; query: string; expect: string[]; returned: { key: string; type: string; title: string }[] }[]
  acl: { golden_leaks: number; probe_tenants: number; probe_queries: number; probe_leaks: number; leaked_sources: string[] }
  health: IndexHealth
  /** LLM-judged answers built from the top hits; absent on older runs, null when disabled or nothing could be judged. */
  answer_quality?: AnswerQualityReport | null
}

export type EvalRunSummary = Pick<EvalRunDoc, 'id' | 'at' | 'questions_run' | 'duration_ms'> & {
  success_at_3: number; success_at_5: number; mrr: number; ndcg10: number; acl_leaks: number
}

async function runsCol(): Promise<Collection<EvalRunDoc>> {
  const col = (await getMongoDb()).collection<EvalRunDoc>(EVAL_RUNS_COLLECTION)
  await col.createIndex({ at: -1 }, { name: 'rag_eval_runs_at' }).catch(() => {})
  return col
}

/** Which questions can run against this index: their expected sources must be indexed. */
export function eligibleQuestions(questions: readonly GoldenQuestion[], indexed: ReadonlySet<string>): {
  run: GoldenQuestion[]; skipped: { id: string; reason: string }[]
} {
  const run: GoldenQuestion[] = []
  const skipped: { id: string; reason: string }[] = []
  for (const q of questions) {
    if (q.fixture !== 'real') { skipped.push({ id: q.id, reason: 'offline fixture' }); continue }
    if (!q.expect.length) {
      // ACL negative: meaningful only while the forbidden source is in the index.
      if ((q.forbid ?? []).some((k) => indexed.has(k))) run.push(q)
      else skipped.push({ id: q.id, reason: 'forbidden source not indexed' })
      continue
    }
    const present = q.expect.filter((k) => indexed.has(k))
    if (q.all ? present.length === q.expect.length : present.length > 0) run.push({ ...q, expect: q.all ? q.expect : present })
    else skipped.push({ id: q.id, reason: 'expected source not indexed' })
  }
  return { run, skipped }
}

function maskTitle(type: string, title: string): string {
  return MASKED_TYPES.has(type) ? SOURCE_TYPE_LABELS[type as KnowledgeSourceType] ?? 'Candidate data' : title.slice(0, 160)
}

async function rowsById(ids: string[]): Promise<Map<string, ChunkAclRow>> {
  if (!ids.length) return new Map()
  const col = await ragChunks()
  const rows = await col.find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, tenant_id: 1, visibility: 1, source_type: 1 } }).toArray()
  return new Map(rows.map((r) => [r.id, { tenant_id: r.tenant_id ?? null, visibility: r.visibility, source_type: r.source_type }]))
}

/** Ask, as each of a few real organisations, for other organisations' and staff-only sources by title. */
async function aclProbes(caller: AgentCaller): Promise<EvalRunDoc['acl'] & { probe_queries: number }> {
  const sources = await ragSources()
  const tenants = ((await sources.distinct('tenant_id', { tenant_id: { $type: 'string' }, status: 'ready' })) as string[]).slice(0, MAX_PROBE_TENANTS)
  let queries = 0
  let leaks = 0
  const leaked = new Set<string>()
  for (const t of tenants) {
    const probe: AgentCaller = { userId: caller.userId, role: 'tenant_admin', tenantId: t }
    const targets = await sources.find(
      { status: 'ready', $or: [{ tenant_id: { $type: 'string', $ne: t } }, { tenant_id: null, visibility: 'platform_admin' }] },
      { projection: { _id: 0, title: 1 } },
    ).limit(PROBES_PER_TENANT).toArray()
    for (const target of targets) {
      const q = String(target.title || '').slice(0, 200)
      if (!q.trim()) continue
      queries++
      const hits = await searchKnowledge({ caller: probe, query: q, limit: 10 })
      const rows = await rowsById(hits.map((h) => h.chunk_id))
      for (const h of hits) {
        const row = rows.get(h.chunk_id)
        if (!row || !oracleCanSee(probe, row)) { leaks++; leaked.add(hitKey(h)) }
      }
    }
  }
  return { golden_leaks: 0, probe_tenants: tenants.length, probe_queries: queries, probe_leaks: leaks, leaked_sources: [...leaked].slice(0, 20) }
}

export async function runLiveEval(caller: AgentCaller): Promise<EvalRunDoc> {
  if (caller.role !== 'superadmin') throw new Error('Superadmin only')
  const started = Date.now()
  const sources = await ragSources()
  const keys = [...new Set(GOLDEN_QUESTIONS.flatMap((q) => [...q.expect, ...(q.forbid ?? [])]))]
  const indexed = new Set(
    (await sources.find({ id: { $in: keys }, status: 'ready', chunk_count: { $gt: 0 } }, { projection: { _id: 0, id: 1 } }).toArray()).map((r) => r.id),
  )
  const { run, skipped } = eligibleQuestions(GOLDEN_QUESTIONS, indexed)

  const callerFor = (as: EvalAs): AgentCaller =>
    as === 'superadmin' ? caller : { userId: caller.userId, role: 'tenant_admin', tenantId: PROBE_TENANT }
  // Top hits per positive question, in memory only, for the answer-quality step (never stored).
  const answerInputs: AnswerInput[] = []
  const onHits: RunDeps['onHits'] = (q, hits) => {
    if (q.expect.length) answerInputs.push({ id: q.id, query: q.query, hits: hits.slice(0, ANSWER_TOP_K).map((h) => ({ type: h.source_type, title: h.title, snippet: h.snippet })) })
  }
  const deps: RunDeps = { search: searchKnowledge, callerFor, rowsById, limit: 10, onHits }
  const results: QuestionResult[] = await runQuestions(run, deps)
  const metrics = aggregate(results)
  // After retrieval so its latency numbers stay honest; never fails the run.
  // A question whose hits leaked is not answered: its snippets aren't the asker's to send anywhere.
  const leaky = new Set(results.filter((r) => r.leaks.length).map((r) => r.id))
  const answerQuality = await runAnswerQuality(answerInputs.filter((a) => !leaky.has(a.id)), { userId: caller.userId }).catch(() => null)
  const probes = await aclProbes(caller)
  const [available, corpusModel, health] = await Promise.all([availableEmbedModels(), dominantEmbeddingModel(), indexHealth()])

  const { failed, ...rest } = metrics
  const doc: EvalRunDoc = {
    id: randomUUID(),
    at: new Date().toISOString(),
    by: caller.userId,
    mode: 'live',
    duration_ms: Date.now() - started,
    embedding: { available, corpus_model: corpusModel },
    questions_total: GOLDEN_QUESTIONS.length,
    questions_run: run.length,
    skipped,
    metrics: rest,
    summary: run.length
      ? [...plainSummary(metrics), ...(answerQuality ? [answerQualitySummary(answerQuality)] : [])]
      : ['None of the golden questions could run: their sources are not indexed yet. Reindex everything, then try again.'],
    failed: failed.slice(0, 30).map((f) => ({
      id: f.id, query: f.query, expect: f.expect,
      returned: f.returned.map((h) => ({ key: MASKED_TYPES.has(h.type) ? h.type : h.key, type: h.type, title: maskTitle(h.type, h.title) })),
    })),
    acl: { ...probes, golden_leaks: metrics.acl_leaks },
    health,
    answer_quality: answerQuality,
  }
  await (await runsCol()).insertOne(doc)
  return doc
}

export async function listEvalRuns(limit = 20): Promise<{ runs: EvalRunSummary[]; latest: EvalRunDoc | null }> {
  const col = await runsCol()
  const docs = await col.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(Math.max(1, Math.min(50, limit))).toArray()
  const runs = docs.map((d) => ({
    id: d.id, at: d.at, questions_run: d.questions_run, duration_ms: d.duration_ms,
    success_at_3: d.metrics.success[3], success_at_5: d.metrics.success[5], mrr: d.metrics.mrr, ndcg10: d.metrics.ndcg10,
    acl_leaks: (d.acl?.golden_leaks ?? 0) + (d.acl?.probe_leaks ?? 0),
  }))
  return { runs, latest: (docs[0] as EvalRunDoc | undefined) ?? null }
}
