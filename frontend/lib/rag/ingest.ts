/**
 * Knowledge ingestion: indexSource / removeSource (lib/agent/contract.ts), the
 * Mongo-backed queue (rag_sources rows with status 'queued'), sweeps and the
 * scheduler tick.
 *
 *  - Hooks call `enqueueKnowledge(type, id)` on create / update / delete; the
 *    loader decides: a source that no longer exists (or is now a draft) is removed.
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
import { embedTexts, availableEmbedModels } from './embed'
import { effectiveVisibility } from './acl'
import { loadSource, listSourceIds, SWEEP_LIMIT } from './sources'
import { ragChunks, ragMeta, ragSources } from './store'
import {
  KNOWLEDGE_SOURCE_TYPES, TENANT_TYPES, sourceKey, tenantKey,
  type KnowledgeSourceType, type RagChunkDoc, type RagSourceDoc,
} from './types'

const nowIso = () => new Date().toISOString()
const LOCK_MS = 5 * 60_000
const MAX_ATTEMPTS = 3

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
    dominant = { model: rows[0]?._id ?? null, at: Date.now() }
  } catch {
    dominant = { model: null, at: Date.now() }
  }
  return dominant.model
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
  const hash = contentHash([extracted.title, extracted.url, tenant, visibility, extracted.text])
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

  const chunks = chunkText(extracted.title, extracted.text)
  const scan = scanPrompt(extracted.text)
  if (scan.flagged) console.warn(`[rag] ${id}: possible prompt injection in source text (${scan.reasons.slice(0, 3).join(', ')}) — indexed as data`)

  const preferModels = [existing?.embedding_model, await dominantEmbeddingModel()].filter((m): m is string => !!m)
  const embedded = chunks.length && models.length
    ? await embedTexts(chunks.map((c) => c.text), { preferModels, feature: 'rag_index' })
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
    text: c.text,
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

/** Claim the next queued (or stale indexing) row atomically. */
async function claimNext(): Promise<RagSourceDoc | null> {
  const col = await ragSources()
  const now = new Date()
  return col.findOneAndUpdate(
    {
      $or: [
        { status: 'queued' },
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
      await col.updateOne(
        { id: row.id, queued_at: row.queued_at ?? null },
        { $set: { status: retry ? 'queued' : 'failed', error: msg, locked_until: null, updated_at: nowIso() } },
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

/** Queue every source in scope, plus stored rows whose source disappeared (they get removed). */
export async function sweepKnowledge(scope: SweepScope = {}): Promise<{ queued: number; byType: Record<string, number> }> {
  const db = await getMongoDb()
  const col = await ragSources()
  const allowed = scope.tenantId ? TENANT_TYPES : KNOWLEDGE_SOURCE_TYPES
  const types = (scope.types?.length ? scope.types : allowed).filter((t) => allowed.includes(t))
  const byType: Record<string, number> = {}
  let queued = 0
  for (const type of types) {
    try {
      const ids = await listSourceIds(db, type, scope.tenantId ?? null)
      const known = new Set(ids)
      const items: EnqueueItem[] = ids.map((id) => ({ type, id, tenantId: scope.tenantId ?? undefined }))
      if (ids.length < SWEEP_LIMIT) {
        const stored = await col.find(
          { type, ...(scope.tenantId ? { tenant_id: scope.tenantId } : {}) },
          { projection: { _id: 0, source_id: 1 } },
        ).limit(SWEEP_LIMIT * 2).toArray()
        for (const s of stored) if (!known.has(s.source_id)) items.push({ type, id: s.source_id })
      }
      const n = await enqueueKnowledge(items, { force: scope.force })
      byType[type] = n
      queued += n
    } catch (e) {
      console.error(`[rag] sweep of ${type} failed:`, e)
      byType[type] = 0
    }
  }
  return { queued, byType }
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
    await processKnowledgeQueue({ budgetMs: 40_000, max: 200 })
  } catch (e) {
    console.error('[rag] tick failed:', e)
  } finally {
    if (locked) await releaseRedisLock(lockKey).catch(() => {})
    ticking = false
  }
}
