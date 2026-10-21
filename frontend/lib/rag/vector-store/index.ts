/**
 * Vector store selection + the write mirror.
 *
 *  - Reads: `vectorReadStore(model)` returns the pgvector store only when
 *    RAG_VECTOR_STORE=pgvector AND pgvector is configured AND the backfill for
 *    that model completed against this same database. Otherwise null → the
 *    Mongo path in lib/rag/search.ts (the default, unchanged).
 *  - Writes: Mongo rag_chunks stays the system of record (text, ACL fields and
 *    the embedding). Whenever pgvector is configured, ingest mirrors each
 *    source's vectors to it. A failed mirror write never fails indexing: the
 *    source goes to `rag_vector_outbox` and the scheduler tick re-syncs it from
 *    Mongo. Search re-reads every hit from Mongo under the ACL filter, so a
 *    stale pgvector row can cost recall for a minute but never leaks.
 */
import { createHash } from 'crypto'
import type { Collection } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { ragChunks, ragMeta } from '../store'
import type { RagChunkDoc } from '../types'
import { pgConnectionOptions, readVectorStoreConfig } from './config'
import { getPgPool } from './pg-pool'
import { PgVectorStore } from './pgvector'
import type { VectorRow, VectorStore } from './types'

export type { VectorRow, VectorStore, VectorStoreKind, ScoredId, VectorQuery } from './types'

export const BACKFILL_KEY_PREFIX = 'pgvector_backfill:'

export interface BackfillState {
  model: string
  /** pgConnectionOptions().fingerprint of the database this backfill wrote to. */
  target: string
  status: 'running' | 'complete'
  phase: 'copy' | 'prune' | 'outbox' | 'done'
  cursor: string | null
  prune_cursor: string | null
  copied: number
  pruned: number
  total_at_start: number
  started_at: string
  updated_at: string
  completed_at: string | null
  lease_until: string | null
  last_error: string | null
}

let storeCache: { url: string; store: PgVectorStore; fingerprint: string; host: string } | null = null

/** The pgvector store when configured (regardless of which store serves reads). */
export async function pgvectorStore(): Promise<{ store: PgVectorStore; fingerprint: string; host: string } | null> {
  const cfg = await readVectorStoreConfig()
  if (!cfg.url) return null
  if (storeCache?.url === cfg.url) return storeCache
  const opts = pgConnectionOptions(cfg.url)
  const store = new PgVectorStore(await getPgPool(cfg.url))
  storeCache = { url: cfg.url, store, fingerprint: opts.fingerprint, host: opts.host }
  return storeCache
}

export async function readBackfillState(model: string): Promise<BackfillState | null> {
  const row = await (await ragMeta()).findOne({ key: `${BACKFILL_KEY_PREFIX}${model}` })
  return (row?.value as BackfillState | undefined) ?? null
}

/** Pure: may reads for `model` use pgvector? */
export function readsMayUsePgvector(want: string, state: BackfillState | null, fingerprint: string | null): boolean {
  return want === 'pgvector' && !!fingerprint && state?.status === 'complete' && state.target === fingerprint
}

let readCache = new Map<string, { at: number; store: VectorStore | null }>()
const READ_TTL_MS = 30_000

/** Store for the vector leg of `model`, or null for the Mongo path. Never throws. */
export async function vectorReadStore(model: string): Promise<VectorStore | null> {
  const hit = readCache.get(model)
  if (hit && Date.now() - hit.at < READ_TTL_MS) return hit.store
  let store: VectorStore | null = null
  try {
    const cfg = await readVectorStoreConfig()
    if (cfg.want === 'pgvector') {
      const pg = await pgvectorStore()
      if (pg && readsMayUsePgvector(cfg.want, await readBackfillState(model), pg.fingerprint)) store = pg.store
    }
  } catch (e) {
    console.warn('[rag/pgvector] read store check failed, using Mongo:', (e as Error).message)
  }
  readCache.set(model, { at: Date.now(), store })
  return store
}

export async function pgvectorReadsActive(model: string | null): Promise<boolean> {
  return !!model && !!(await vectorReadStore(model))
}

/** Tests / backfill completion / admin switch: forget cached decisions. */
export function resetVectorStoreCaches(): void {
  readCache = new Map()
  storeCache = null
}

export function textHash(text: string): string {
  return createHash('sha256').update(text ?? '').digest('hex').slice(0, 32)
}

/** Mongo chunk → vector row (null when it has no usable embedding). */
export function chunkToVectorRow(c: Pick<RagChunkDoc, 'id' | 'source_type' | 'source_id' | 'tenant_id' | 'tenant_key' | 'visibility' | 'chunk_index' | 'text' | 'embedding' | 'embedding_model' | 'metadata' | 'updated_at'>): VectorRow | null {
  if (!Array.isArray(c.embedding) || !c.embedding.length || typeof c.embedding_model !== 'string' || !c.embedding_model) return null
  return {
    id: c.id,
    source_type: c.source_type,
    source_id: c.source_id,
    tenant_key: c.tenant_key,
    tenant_id: c.tenant_id ?? null,
    visibility: c.visibility,
    chunk_index: c.chunk_index,
    text_hash: textHash(c.text),
    embedding_model: c.embedding_model,
    embedding: c.embedding,
    metadata: (c.metadata ?? {}) as Record<string, unknown>,
    updated_at: c.updated_at,
  }
}

// ─── Outbox (failed mirror writes) ───────────────────────────────────────────

interface OutboxDoc { key: string; source_type: string; source_id: string; at: string; attempts: number; error: string | null }

let outboxIdx: Promise<unknown> | null = null
async function outbox(): Promise<Collection<OutboxDoc>> {
  const col = (await getMongoDb()).collection<OutboxDoc>('rag_vector_outbox')
  if (!outboxIdx) {
    outboxIdx = Promise.all([
      col.createIndex({ key: 1 }, { unique: true, name: 'rag_vector_outbox_key' }),
      col.createIndex({ at: 1 }, { name: 'rag_vector_outbox_at' }),
    ]).catch((e) => {
      outboxIdx = null
      console.error('[rag] rag_vector_outbox index build failed', e)
    })
  }
  await outboxIdx
  return col
}

async function enqueueOutbox(sourceType: string, sourceId: string, error: string): Promise<void> {
  try {
    const col = await outbox()
    const key = `${sourceType}:${sourceId}`
    await col.updateOne(
      { key },
      { $set: { source_type: sourceType, source_id: sourceId, at: new Date().toISOString(), error: error.slice(0, 200) }, $inc: { attempts: 1 }, $setOnInsert: { key } },
      { upsert: true },
    )
  } catch (e) {
    console.error('[rag/pgvector] outbox write failed:', (e as Error).message)
  }
}

export async function outboxCount(): Promise<number> {
  try { return await (await outbox()).countDocuments({}) } catch { return 0 }
}

// ─── Mirror (called by lib/rag/ingest after the Mongo write) ─────────────────

/** Replace one source's vectors in pgvector. Never throws. */
export async function mirrorReplaceSource(sourceType: string, sourceId: string, chunks: readonly RagChunkDoc[]): Promise<void> {
  let pg: Awaited<ReturnType<typeof pgvectorStore>> = null
  try {
    pg = await pgvectorStore()
  } catch (e) {
    console.warn('[rag/pgvector] not usable:', (e as Error).message)
    return
  }
  if (!pg) return
  try {
    const rows = chunks.map(chunkToVectorRow).filter((r): r is VectorRow => !!r)
    await pg.store.replaceSource(sourceType, sourceId, rows)
  } catch (e) {
    const msg = (e as Error).message
    console.warn(`[rag/pgvector] mirror of ${sourceType}:${sourceId} failed, queued for re-sync:`, msg.slice(0, 200))
    await enqueueOutbox(sourceType, sourceId, msg)
  }
}

export async function mirrorDeleteSource(sourceType: string, sourceId: string): Promise<void> {
  await mirrorReplaceSource(sourceType, sourceId, [])
}

/** Re-sync outbox sources from Mongo (scheduler tick + backfill). */
export async function drainVectorOutbox(opts: { limit?: number; budgetMs?: number } = {}): Promise<{ synced: number; failed: number; remaining: number }> {
  const pg = await pgvectorStore().catch(() => null)
  if (!pg) return { synced: 0, failed: 0, remaining: 0 }
  const col = await outbox()
  const deadline = Date.now() + (opts.budgetMs ?? 10_000)
  const items = await col.find({}, { projection: { _id: 0 } }).sort({ at: 1 }).limit(opts.limit ?? 200).toArray()
  const chunksCol = await ragChunks()
  let synced = 0
  let failed = 0
  for (const it of items) {
    if (Date.now() > deadline) break
    try {
      const chunks = (await chunksCol.find({ source_type: it.source_type, source_id: it.source_id } as never, { projection: { _id: 0 } }).toArray()) as RagChunkDoc[]
      await pg.store.replaceSource(it.source_type, it.source_id, chunks.map(chunkToVectorRow).filter((r): r is VectorRow => !!r))
      // Only clear it if no newer failure re-queued it meanwhile.
      await col.deleteOne({ key: it.key, at: it.at })
      synced++
    } catch (e) {
      failed++
      await col.updateOne({ key: it.key }, { $inc: { attempts: 1 }, $set: { error: (e as Error).message.slice(0, 200) } }).catch(() => {})
    }
  }
  return { synced, failed, remaining: await col.countDocuments({}).catch(() => 0) }
}
