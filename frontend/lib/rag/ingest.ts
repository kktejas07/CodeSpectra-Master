/**
 * Knowledge ingestion: indexSource / removeSource (lib/agent/contract.ts), the
 * Mongo-backed queue (rag_sources rows with status 'queued'), sweeps and the
 * scheduler tick.
 *
 *  - Hooks call `refreshKnowledge(type, id)` on create / update / delete: queued,
 *    and a source the loader no longer returns (deleted, unpublished, hidden,
 *    draft) is removed at once — not at the next tick or the nightly sweep.
 *  - lib/scheduler.ts calls `runKnowledgeTick()` every minute: a nightly full
 *    sweep (02:00 UTC) + up to ~40 s of queue work. A Redis lock (when Redis is
 *    configured) keeps replicas from double-working; each row is also claimed
 *    atomically, so overlap is harmless anyway.
 *  - Unchanged content (content_hash) is skipped, so sweeps cost DB reads only.
 */
import type { AnyBulkWriteOperation } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { acquireRedisLock, releaseRedisLock } from '@/lib/upstash-rate-limit'
import { chunkText, contentHash } from './chunk'
import { CONTEXTUAL_HASH_MARKER, contextualActive, generateChunkContexts } from './contextual'
import { embedTexts, availableEmbedModels } from './embed'
import { effectiveVisibility } from './acl'
import { iterateSourceIds, loadSource } from './sources'
import { ragChunks, ragMeta, ragSources } from './store'
import { mirrorDeleteSource, mirrorReplaceSource } from './vector-store'
import {
  KNOWLEDGE_SOURCE_TYPES, TENANT_TYPES, sourceKey, tenantKey,
  type KnowledgeSourceType, type RagChunkDoc, type RagSourceDoc,
} from './types'

const nowIso = () => new Date().toISOString()
const LOCK_MS = 5 * 60_000
const MAX_ATTEMPTS = 3

/** Backoff before retry n (1-based): 1, 4, 16 … minutes, capped at 1 hour. */
export function retryBackoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 60_000 * 4 ** Math.max(0, attempt - 1))
}

// ─── Dominant model (keep one model per corpus where possible) ───────────────

let dominant: { model: string | null; at: number } | null = null

export async function dominantEmbeddingModel(): Promise<string | null> {
  if (dominant && Date.now() - dominant.at < 10 * 60_000) return dominant.model
  try {
    const col = await ragSources()
    const rows = await col.aggregate<{ _id: string | null; n: number }>([
      { $match: { embedding_model: { $type: 'string' } } },
      { $group: { _id: '$embedding_model', n: { $sum: '$chunk_count' } } },
      { $sort: { n: -1 } },
      { $limit: 1 },
    ]).toArray()
    const model = rows[0]?._id ?? null
    // Only a real model is cached: "no vectors yet" must not hide the first vectors for 10 minutes.
    dominant = model ? { model, at: Date.now() } : null
    return model
  } catch {
    return null
  }
}

// ─── Index / remove ──────────────────────────────────────────────────────────

export interface IndexOptions {
  force?: boolean
  /** Queue claim this run belongs to: only then may it mark the row 'ready'. */
  claimedQueuedAt?: string | null
}

export async function removeSource(type: KnowledgeSourceType, sourceId: string): Promise<void> {
  const [chunks, sources] = await Promise.all([ragChunks(), ragSources()])
  await chunks.deleteMany({ source_type: type, source_id: sourceId })
  await sources.deleteOne({ type, source_id: sourceId })
  await mirrorDeleteSource(type, sourceId)
}

export async function indexSource(type: KnowledgeSourceType, sourceId: string, opts: IndexOptions = {}): Promise<{ chunks: number }> {
  const db = await getMongoDb()
  const extracted = await loadSource(db, type, sourceId)
  if (!extracted) {
    await removeSource(type, sourceId)
    return { chunks: 0 }
  }
  const [chunksCol, sourcesCol] = await Promise.all([ragChunks(), ragSources()])
  const id = sourceKey(type, sourceId)
  const tenant = extracted.tenant_id
  const visibility = effectiveVisibility(type, tenant, extracted.visibility)
  // Contextual types carry a marker so enabling contexts re-indexes them once; other types keep their hashes (no mass re-embed).
  const contextual = contextualActive(type)
  const hash = contentHash([
    extracted.title, extracted.url, tenant, visibility, extracted.text,
    ...(extracted.chunk ? [extracted.chunk] : []), ...(contextual ? [CONTEXTUAL_HASH_MARKER] : []),
  ])
  const existing = await sourcesCol.findOne({ id })
  const now = nowIso()

  const statusFilter = opts.claimedQueuedAt !== undefined ? { id, queued_at: opts.claimedQueuedAt } : { id }
  const finish = async (set: Partial<RagSourceDoc>) => {
    const res = await sourcesCol.updateOne(statusFilter, { $set: { ...set, status: 'ready', error: null, locked_until: null, attempts: 0, force: false } })
    // Re-queued while we worked: keep it queued, but still record what we wrote.
    if (res.matchedCount === 0) await sourcesCol.updateOne({ id }, { $set: set })
  }

  const models = await availableEmbedModels()
  const unchanged = existing?.content_hash === hash && existing.status !== 'failed' && (existing.chunk_count ?? 0) > 0
  const needsVectors = !!existing?.embedding_missing && models.length > 0
  if (unchanged && !opts.force && !existing?.force && !needsVectors) {
    await finish({ indexed_at: now })
    return { chunks: existing?.chunk_count ?? 0 }
  }

  const chunks = chunkText(extracted.title, extracted.text, extracted.chunk)
  const scan = scanPrompt(extracted.text)
  if (scan.flagged) console.warn(`[rag] ${id}: possible prompt injection in source text (${scan.reasons.slice(0, 3).join(', ')}) — indexed as data`)

  // One LLM call per changed multi-chunk source; null → indexed exactly as without contexts.
  // ponytail: a failed call is not retried until the content changes or a forced reindex
  // (the hash already carries the marker). Ceiling: an outage during a sweep leaves those
  // sources context-less — reindex the type to fill them in. Flagged (possible injection)
  // sources and runs without an embedder skip the call: contexts only feed the vectors.
  const contexts = contextual && models.length && !scan.flagged
    ? await generateChunkContexts(extracted.title, extracted.text, chunks.map((c) => c.body))
    : null

  const preferModels = [existing?.embedding_model, await dominantEmbeddingModel()].filter((m): m is string => !!m)
  const embedded = chunks.length && models.length
    ? await embedTexts(chunks.map((c, i) => (contexts ? `${contexts[i]}\n\n${c.text}` : c.text)), { preferModels, feature: 'rag_index' })
    : null

  const rows: RagChunkDoc[] = chunks.map((c) => ({
    id: `${id}:${c.index}`,
    source_type: type,
    source_id: sourceId,
    tenant_id: tenant,
    tenant_key: tenantKey(tenant),
    visibility,
    title: extracted.title,
    url: extracted.url,
    chunk_index: c.index,
    // Keyword search ($text over title + text, store.ts) does not see `context` yet:
    // adding it to the text index needs a drop / rebuild.
    text: c.text,
    ...(contexts ? { context: contexts[c.index] } : {}),
    ...(embedded ? { embedding: embedded.vectors[c.index], embedding_model: embedded.model } : {}),
    content_hash: hash,
    section: c.section,
    metadata: { section: c.section, ...(scan.flagged ? { prompt_flags: scan.reasons.slice(0, 5) } : {}) },
    updated_at: now,
  }))

  if (rows.length) {
    const ops: AnyBulkWriteOperation<RagChunkDoc>[] = rows.map((r) => ({ replaceOne: { filter: { id: r.id }, replacement: r, upsert: true } }))
    await chunksCol.bulkWrite(ops, { ordered: false })
  }
  await chunksCol.deleteMany({ source_type: type, source_id: sourceId, chunk_index: { $gte: rows.length } })
  // pgvector (when configured) gets the same vectors; a failure is queued, never thrown.
  await mirrorReplaceSource(type, sourceId, rows)

  const set: Partial<RagSourceDoc> & Record<string, unknown> = {
    type,
    source_id: sourceId,
    tenant_id: tenant,
    tenant_key: tenantKey(tenant),
    visibility,
    title: extracted.title,
    url: extracted.url,
    chunk_count: rows.length,
    content_hash: hash,
    embedding_model: embedded?.model ?? null,
    embedding_missing: !embedded && rows.length > 0,
    indexed_at: now,
    updated_at: now,
    // Staff-only extras (e.g. question answer keys) live on the source row, never in chunks.
    metadata: extracted.metadata ?? null,
    prompt_flags: scan.reasons.slice(0, 5),
  }
  if (!existing) {
    await sourcesCol.updateOne({ id }, { $setOnInsert: { id, status: 'indexing', error: null, queued_at: null } }, { upsert: true })
  }
  await finish(set)
  return { chunks: rows.length }
}

// ─── Queue ───────────────────────────────────────────────────────────────────

export interface EnqueueItem {
  type: KnowledgeSourceType
  id: string
  /** Owner, when the caller knows it (lets tenant admins see the queued row). */
  tenantId?: string | null
}

/** Queue sources for (re)indexing. Never throws — hooks must not break the write they follow. */
export async function enqueueKnowledge(items: EnqueueItem | EnqueueItem[], opts: { force?: boolean } = {}): Promise<number> {
  const list = (Array.isArray(items) ? items : [items]).filter((i) => i && (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(i.type) && typeof i.id === 'string' && i.id)
  if (!list.length) return 0
  try {
    const col = await ragSources()
    const now = nowIso()
    const ops: AnyBulkWriteOperation<RagSourceDoc>[] = list.map((i) => ({
      updateOne: {
        filter: { id: sourceKey(i.type, i.id) },
        update: {
          $set: { status: 'queued', queued_at: now, attempts: 0, ...(opts.force ? { force: true } : {}) },
          $setOnInsert: {
            id: sourceKey(i.type, i.id), type: i.type, source_id: i.id,
            tenant_id: i.tenantId ?? null, tenant_key: tenantKey(i.tenantId ?? null),
            title: '', url: null, error: null, chunk_count: 0, content_hash: null, embedding_model: null,
            updated_at: now,
          },
        },
        upsert: true,
      },
    }))
    for (let i = 0; i < ops.length; i += 500) await col.bulkWrite(ops.slice(i, i + 500), { ordered: false })
    return list.length
  } catch (e) {
    console.error('[rag] enqueue failed:', e)
    return 0
  }
}

/** At most this many sources per write are checked inline; the rest wait for the queue tick. */
export const REMOVE_NOW_MAX = 50

/**
 * Write-path refresh (RAG-024): queue the sources, then — right away, not at
 * the next tick or the nightly sweep — remove any that the loader no longer
 * returns (deleted, unpublished, hidden, now a draft). Existing ones are
 * re-indexed by the queue as before (embedding stays off the request path).
 * Never throws.
 */
export async function refreshKnowledge(items: EnqueueItem | EnqueueItem[], deps: { load?: typeof loadSource; remove?: typeof removeSource } = {}): Promise<{ queued: number; removed: number }> {
  const list = (Array.isArray(items) ? items : [items]).filter((i) => i && (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(i.type) && typeof i.id === 'string' && i.id)
  const queued = await enqueueKnowledge(list)
  let removed = 0
  try {
    const load = deps.load ?? loadSource
    const remove = deps.remove ?? removeSource
    const db = await getMongoDb()
    for (const i of list.slice(0, REMOVE_NOW_MAX)) {
      if (await load(db, i.type, i.id)) continue
      await remove(i.type, i.id)
      removed++
    }
  } catch (e) {
    console.error('[rag] immediate removal failed (the queue will retry):', (e as Error)?.message)
  }
  return { queued, removed }
}

/** Claim the next queued (or stale indexing) row atomically. */
async function claimNext(): Promise<RagSourceDoc | null> {
  const col = await ragSources()
  const now = new Date()
  return col.findOneAndUpdate(
    {
      $or: [
        // queued_at in the future = a retry waiting out its backoff (RAG-006).
        { status: 'queued', $or: [{ queued_at: { $lte: now.toISOString() } }, { queued_at: null }] },
        { status: 'indexing', locked_until: { $lt: now.toISOString() } },
      ],
    },
    { $set: { status: 'indexing', locked_until: new Date(now.getTime() + LOCK_MS).toISOString() }, $inc: { attempts: 1 } },
    { sort: { queued_at: 1 }, returnDocument: 'after' },
  )
}

export async function processKnowledgeQueue(opts: { max?: number; budgetMs?: number } = {}): Promise<{ processed: number; failed: number }> {
  const max = opts.max ?? 100
  const deadline = Date.now() + (opts.budgetMs ?? 40_000)
  let processed = 0
  let failed = 0
  const col = await ragSources()
  while (processed + failed < max && Date.now() < deadline) {
    const row = await claimNext()
    if (!row) break
    try {
      await indexSource(row.type, row.source_id, { claimedQueuedAt: row.queued_at ?? null })
      processed++
    } catch (e) {
      failed++
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
      const retry = (row.attempts ?? 1) < MAX_ATTEMPTS
      // RAG-006: retries back off exponentially (1, 4, 16 min) instead of hammering in the same tick.
      const backoffMs = retryBackoffMs(row.attempts ?? 1)
      await col.updateOne(
        { id: row.id, queued_at: row.queued_at ?? null },
        { $set: { status: retry ? 'queued' : 'failed', error: msg, locked_until: null, updated_at: nowIso(), ...(retry ? { queued_at: new Date(Date.now() + backoffMs).toISOString() } : {}) } },
      )
      console.error(`[rag] indexing ${row.id} failed:`, msg)
    }
  }
  return { processed, failed }
}

// ─── Sweeps ──────────────────────────────────────────────────────────────────

export interface SweepScope {
  /** Only this organisation's sources (tenant admins always pass theirs). */
  tenantId?: string | null
  types?: KnowledgeSourceType[]
  force?: boolean
}

/**
 * Queue every source in scope, plus stored rows whose source disappeared (they
 * get removed). RAG-005: ids are paged (no per-type ceiling) and the orphan
 * check pages through the stored rows too, so it always runs.
 */
export async function sweepKnowledge(scope: SweepScope = {}): Promise<{ queued: number; byType: Record<string, number> }> {
  const db = await getMongoDb()
  const col = await ragSources()
  const allowed = scope.tenantId ? TENANT_TYPES : KNOWLEDGE_SOURCE_TYPES
  const types = (scope.types?.length ? scope.types : allowed).filter((t) => allowed.includes(t))
  const byType: Record<string, number> = {}
  let queued = 0
  for (const type of types) {
    try {
      const known = new Set<string>()
      let n = 0
      for await (const page of iterateSourceIds(db, type, scope.tenantId ?? null)) {
        for (const id of page) known.add(id)
        n += await enqueueKnowledge(page.map((id) => ({ type, id, tenantId: scope.tenantId ?? undefined })), { force: scope.force })
      }
      // Orphans: stored rows whose source is gone (the loader removes them).
      let after: string | null = null
      for (;;) {
        const stored: { source_id: string }[] = await col.find(
          { type, ...(scope.tenantId ? { tenant_id: scope.tenantId } : {}), ...(after !== null ? { source_id: { $gt: after } } : {}) },
          { projection: { _id: 0, source_id: 1 } },
        ).sort({ source_id: 1 }).limit(5000).toArray()
        const orphans = stored.filter((r) => !known.has(r.source_id)).map((r) => ({ type, id: r.source_id }))
        if (orphans.length) n += await enqueueKnowledge(orphans)
        if (stored.length < 5000) break
        after = stored[stored.length - 1].source_id
      }
      byType[type] = n
      queued += n
    } catch (e) {
      console.error(`[rag] sweep of ${type} failed:`, e)
      byType[type] = 0
    }
  }
  return { queued, byType }
}

/** Account deleted (RAG-004): remove that person's résumé + attempt sources in every organisation. */
export async function purgeUserKnowledge(userId: string): Promise<number> {
  if (!userId) return 0
  const [chunks, sources] = await Promise.all([ragChunks(), ragSources()])
  const esc = userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const filter = { $or: [
    { type: 'resume', source_id: { $regex: `:${esc}$` } },
    { type: 'attempt_summary', source_id: { $regex: `:${esc}$` } },
  ] }
  const rows = await sources.find(filter as never, { projection: { _id: 0, type: 1, source_id: 1 } }).limit(5000).toArray()
  for (const r of rows) {
    await chunks.deleteMany({ source_type: r.type, source_id: r.source_id })
    await mirrorDeleteSource(r.type, r.source_id)
  }
  await sources.deleteMany(filter as never)
  return rows.length
}

/**
 * RAG-006 / RAG-011 maintenance (hourly): re-queue sources indexed without
 * vectors once a provider answers again, and re-embed sources stored with a
 * minority embedding model into the corpus's dominant model (so vector search,
 * which only compares one model, sees them).
 */
export async function requeueEmbeddingGaps(limit = 500): Promise<{ missing: number; minority: number }> {
  const models = await availableEmbedModels()
  if (!models.length) return { missing: 0, minority: 0 }
  const col = await ragSources()
  const missing = await col.find({ embedding_missing: true, status: { $in: ['ready', 'failed'] } }, { projection: { _id: 0, type: 1, source_id: 1, tenant_id: 1 } }).limit(limit).toArray()
  if (missing.length) await enqueueKnowledge(missing.map((r) => ({ type: r.type, id: r.source_id, tenantId: r.tenant_id })), { force: true })
  const dominantModel = await dominantEmbeddingModel()
  let minority: { type: KnowledgeSourceType; source_id: string; tenant_id: string | null }[] = []
  if (dominantModel && models.includes(dominantModel)) {
    minority = await col.find({ status: 'ready', embedding_model: { $nin: [dominantModel, null] } }, { projection: { _id: 0, type: 1, source_id: 1, tenant_id: 1 } }).limit(limit).toArray()
    if (minority.length) await enqueueKnowledge(minority.map((r) => ({ type: r.type, id: r.source_id, tenantId: r.tenant_id })), { force: true })
  }
  return { missing: missing.length, minority: minority.length }
}

/** Run `fn` at most once per `key` value (stored in rag_meta; a lost race just skips). */
async function oncePer(key: string, value: string, fn: () => Promise<unknown>): Promise<boolean> {
  const meta = await ragMeta()
  const res = await meta.updateOne({ key, value: { $ne: value } }, { $set: { value, updated_at: nowIso() } })
  if (res.modifiedCount === 0) {
    const exists = await meta.findOne({ key })
    if (exists) return false
    try { await meta.insertOne({ key, value, updated_at: nowIso() }) } catch { return false }
  }
  await fn()
  return true
}

/** Vector health (RAG-010 / RAG-011): alert admins when search runs keyword-only or the in-process scan is capped. */
export async function vectorHealthAlert(now = new Date()): Promise<string | null> {
  const [models, chunks] = await Promise.all([availableEmbedModels(), ragChunks()])
  const total = await chunks.estimatedDocumentCount().catch(() => 0)
  let problem: string | null = null
  if (!models.length && total > 0) problem = 'No embedding provider is answering, so knowledge search is keyword-only. Add an OpenAI / OpenRouter or Gemini key in Settings → AI.'
  else {
    const { atlasVectorAvailable, INPROC_MAX_SCAN } = await import('./search')
    const { pgvectorReadsActive } = await import('./vector-store')
    if (total > INPROC_MAX_SCAN && !(await atlasVectorAvailable()) && !(await pgvectorReadsActive(await dominantEmbeddingModel()))) {
      problem = `The knowledge base has ${total.toLocaleString('en-US')} chunks and no Atlas vector index, so each query's vector search reads at most ${INPROC_MAX_SCAN.toLocaleString('en-US')} chunks (within the caller's tenant / type scope) and may miss relevant content. Create the Atlas vector index (definition in lib/rag/search.ts) or move vectors to Postgres + pgvector (docs/devops/09-RAG-Vector-Store.md). Raising RAG_INPROC_MAX_SCAN trades recall for memory and Mongo I/O on every query.`
    }
  }
  if (!problem) return null
  try {
    const { sendAdminAlert } = await import('@/lib/automation/alerts')
    await sendAdminAlert({ key: 'rag-vector-health', title: 'Knowledge search is degraded', detail: problem, severity: 'warning', link: '/dashboard/admin/knowledge', windowMinutes: 24 * 60 }, now)
  } catch (e) {
    console.error('[rag] vector health alert failed:', e)
  }
  return problem
}

/** Weekly live evaluation with an alert on regressions (RAG-020). Mondays after 03:00 UTC. */
export async function maybeWeeklyLiveEval(now = new Date()): Promise<boolean> {
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 3) return false
  const week = now.toISOString().slice(0, 10)
  return oncePer('weekly_live_eval', week, async () => {
    const { runLiveEval, listEvalRuns } = await import('./eval/live')
    const before = (await listEvalRuns(1)).runs[0] ?? null
    const run = await runLiveEval({ userId: 'system:rag-weekly-eval', role: 'superadmin', tenantId: null })
    const s5 = run.metrics.success[5] ?? 0
    const leaks = (run.acl?.golden_leaks ?? 0) + (run.acl?.probe_leaks ?? 0)
    const dropped = before && before.questions_run > 0 && run.questions_run > 0 && s5 < before.success_at_5 - 0.05
    if (leaks > 0 || dropped) {
      const { sendAdminAlert } = await import('@/lib/automation/alerts')
      await sendAdminAlert({
        key: 'rag-weekly-eval',
        title: leaks > 0 ? 'Knowledge search leaked data in the weekly check' : 'Knowledge search quality dropped',
        detail: leaks > 0 ? `${leaks} access-control leak(s) in the weekly live evaluation. Open the knowledge page now.` : `success@5 fell from ${(before!.success_at_5 * 100).toFixed(1)}% to ${(s5 * 100).toFixed(1)}%.`,
        severity: leaks > 0 ? 'critical' : 'warning',
        link: '/dashboard/admin/knowledge',
      }, now).catch((e) => console.error('[rag] eval alert failed:', e))
    }
  })
}

/** Once per UTC day after 02:00: full sweep. */
export async function maybeNightlySweep(now = new Date()): Promise<boolean> {
  if (now.getUTCHours() < 2) return false
  const day = now.toISOString().slice(0, 10)
  const meta = await ragMeta()
  const res = await meta.updateOne(
    { key: 'nightly_sweep', value: { $ne: day } },
    { $set: { value: day, updated_at: nowIso() } },
    { upsert: false },
  )
  if (res.modifiedCount === 0) {
    // First run ever: create the row (a duplicate-key race just means another replica won).
    const exists = await meta.findOne({ key: 'nightly_sweep' })
    if (exists) return false
    try { await meta.insertOne({ key: 'nightly_sweep', value: day, updated_at: nowIso() }) } catch { return false }
  }
  await sweepKnowledge()
  return true
}

let ticking = false

/** Called from the scheduler loop every minute. Never throws. */
export async function runKnowledgeTick(): Promise<void> {
  if (ticking) return
  ticking = true
  const lockKey = 'codespectra:lock:rag-queue'
  let locked = false
  try {
    locked = await acquireRedisLock(lockKey, 90)
    if (!locked) return
    await maybeNightlySweep().catch((e) => console.error('[rag] nightly sweep failed:', e))
    const now = new Date()
    const hour = now.toISOString().slice(0, 13)
    await oncePer('hourly_maintenance', hour, async () => {
      await requeueEmbeddingGaps().catch((e) => console.error('[rag] embedding re-queue failed:', e))
      await vectorHealthAlert(now).catch((e) => console.error('[rag] vector health check failed:', e))
    }).catch((e) => console.error('[rag] hourly maintenance failed:', e))
    await maybeWeeklyLiveEval(now).catch((e) => console.error('[rag] weekly live eval failed:', e))
    // pgvector: re-sync failed mirror writes, and keep an unfinished backfill moving.
    {
      const { drainVectorOutbox } = await import('./vector-store')
      const { continueBackfill } = await import('./vector-store/backfill')
      await drainVectorOutbox({ budgetMs: 5_000 }).catch((e) => console.error('[rag] vector outbox drain failed:', e))
      await continueBackfill(15_000).catch((e) => console.error('[rag] pgvector backfill step failed:', e))
    }
    // AGT-007: weekly copilot behaviour eval rides the same scheduler tick.
    const { weeklyEvalDue, runWeeklyCopilotEval } = await import('@/lib/agent/eval/weekly')
    if (weeklyEvalDue(now)) {
      await oncePer('weekly_copilot_eval', now.toISOString().slice(0, 10), () => runWeeklyCopilotEval(now))
        .catch((e) => console.error('[agent] weekly copilot eval failed:', e))
    }
    await processKnowledgeQueue({ budgetMs: 40_000, max: 200 })
  } catch (e) {
    console.error('[rag] tick failed:', e)
  } finally {
    if (locked) await releaseRedisLock(lockKey).catch(() => {})
    ticking = false
  }
}
