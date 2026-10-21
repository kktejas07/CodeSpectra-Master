/**
 * Backfill: copy the Mongo chunk vectors of one embedding model into pgvector,
 * resumable and safe to re-run.
 *
 *   copy    rag_chunks rows of the model in id order, upserted by chunk id
 *           (cursor saved after every batch → a timeout or crash resumes there)
 *   prune   pgvector rows whose chunk no longer exists in Mongo are deleted
 *   outbox  failed live-mirror writes are re-synced
 *   done    status 'complete' for THIS database (fingerprint) → reads may flip
 *           to pgvector when RAG_VECTOR_STORE=pgvector.
 *
 * The live mirror (./index.ts) runs during the backfill, so rows behind the
 * cursor stay current. Each call works for `budgetMs` and returns; the admin
 * action calls it again (and the scheduler tick continues an unfinished run).
 * Dry run: counts, connectivity and pgvector version only — writes nothing.
 */
import { dominantEmbeddingModel } from '../ingest'
import { ragChunks, ragMeta } from '../store'
import type { RagChunkDoc } from '../types'
import {
  BACKFILL_KEY_PREFIX, chunkToVectorRow, drainVectorOutbox, outboxCount, pgvectorStore, readBackfillState,
  resetVectorStoreCaches, vectorReadStore, type BackfillState, type VectorRow,
} from './index'
import { dimsFor, MIN_PGVECTOR_VERSION, versionAtLeast } from './pgvector'
import { readVectorStoreConfig } from './config'

export class BackfillError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const LEASE_MS = 2 * 60_000
const PROJECTION = {
  _id: 0, id: 1, source_type: 1, source_id: 1, tenant_id: 1, tenant_key: 1, visibility: 1, chunk_index: 1,
  text: 1, embedding: 1, embedding_model: 1, metadata: 1, updated_at: 1,
} as const

export interface BackfillPlan {
  dry_run: true
  model: string
  host: string
  mongo_vectors: number
  pg_vectors: number
  pgvector_version: string | null
  version_ok: boolean
  table_exists: boolean
  /** Rough on-disk size in Postgres: vectors + row overhead + HNSW graph. */
  estimated_mb: number
  state: BackfillState | null
}

export interface BackfillResult {
  dry_run: false
  done: boolean
  state: BackfillState
}

/** Rough Postgres footprint for `n` vectors of `dims` (pure): heap ≈ 4·dims + 300 B, HNSW ≈ the same again. */
export function estimateMb(n: number, dims: number): number {
  return Math.ceil((n * (4 * dims + 300) * 2) / (1024 * 1024))
}

async function saveState(state: BackfillState): Promise<void> {
  const meta = await ragMeta()
  const key = `${BACKFILL_KEY_PREFIX}${state.model}`
  const now = new Date().toISOString()
  state.updated_at = now
  const res = await meta.updateOne({ key }, { $set: { value: state, updated_at: now } })
  if (res.matchedCount === 0) await meta.insertOne({ key, value: state, updated_at: now })
}

export async function resetBackfill(model: string): Promise<void> {
  await (await ragMeta()).deleteOne({ key: `${BACKFILL_KEY_PREFIX}${model}` })
  resetVectorStoreCaches()
}

async function resolveModel(model?: string | null): Promise<string> {
  const m = (model ?? '').trim() || (await dominantEmbeddingModel())
  if (!m) throw new BackfillError('There are no embedded chunks to copy yet.')
  if (!/^[A-Za-z0-9._:/-]{1,80}$/.test(m)) throw new BackfillError('Invalid embedding model.')
  return m
}

export async function runBackfill(opts: {
  dryRun?: boolean
  model?: string | null
  restart?: boolean
  budgetMs?: number
  batchSize?: number
} = {}): Promise<BackfillPlan | BackfillResult> {
  const cfg = await readVectorStoreConfig()
  if (cfg.error) throw new BackfillError(cfg.error)
  const pg = await pgvectorStore()
  if (!pg) throw new BackfillError('Set PGVECTOR_URL (or the pgvector URL in Admin → Settings) first.')
  const model = await resolveModel(opts.model)
  const chunks = await ragChunks()
  const scope = { embedding_model: model }

  if (opts.dryRun) {
    const [mongoVectors, version, table, state] = await Promise.all([
      chunks.countDocuments(scope),
      pg.store.extensionVersion().catch(() => null),
      pg.store.tableFor(model).catch(() => null),
      readBackfillState(model),
    ])
    const sample = await chunks.findOne(scope, { projection: { _id: 0, embedding: 1 } })
    const dims = table?.dims ?? (Array.isArray(sample?.embedding) ? sample.embedding.length : dimsFor(model, 1536))
    return {
      dry_run: true,
      model,
      host: pg.host,
      mongo_vectors: mongoVectors,
      pg_vectors: table ? await pg.store.count(model) : 0,
      pgvector_version: version,
      version_ok: !!version && versionAtLeast(version, MIN_PGVECTOR_VERSION),
      table_exists: !!table,
      estimated_mb: estimateMb(mongoVectors, dims),
      state,
    }
  }

  const budgetMs = Math.max(1, Math.min(120_000, opts.budgetMs ?? 25_000))
  const batch = Math.max(50, Math.min(2_000, Math.floor(opts.batchSize ?? 500)))
  const deadline = Date.now() + budgetMs
  let steps = 0
  // Every call makes at least one step, so even a tiny budget always progresses.
  const more = () => steps++ === 0 || Date.now() < deadline
  const nowIso = () => new Date().toISOString()

  let state = await readBackfillState(model)
  // ponytail: a lease in rag_meta (no compare-and-set); two overlapping runs only
  // repeat idempotent upserts, so the worst case is wasted work, not bad data.
  if (state?.lease_until && state.lease_until > nowIso() && !opts.restart) {
    throw new BackfillError('A backfill for this model is already running. Try again in a couple of minutes.', 409)
  }
  if (!state || state.target !== pg.fingerprint || opts.restart) {
    state = {
      model, target: pg.fingerprint, status: 'running', phase: 'copy', cursor: null, prune_cursor: null,
      copied: 0, pruned: 0, total_at_start: await chunks.countDocuments(scope),
      started_at: nowIso(), updated_at: nowIso(), completed_at: null, lease_until: null, last_error: null,
    }
    resetVectorStoreCaches() // a restarted backfill sends reads back to Mongo until it completes
  }
  if (state.status === 'complete') return { dry_run: false, done: true, state }

  const sample = await chunks.findOne(scope, { projection: { _id: 0, embedding: 1 } })
  await pg.store.ensureSchema(model, Array.isArray(sample?.embedding) ? sample.embedding.length : undefined)

  const lease = () => { state!.lease_until = new Date(Date.now() + LEASE_MS).toISOString() }
  lease()
  await saveState(state)
  try {
    while (state.phase === 'copy' && more()) {
      const rows = (await chunks
        .find({ ...scope, ...(state.cursor !== null ? { id: { $gt: state.cursor } } : {}) }, { projection: PROJECTION })
        .sort({ id: 1 })
        .limit(batch)
        .toArray()) as RagChunkDoc[]
      const vectors = rows.map(chunkToVectorRow).filter((r): r is VectorRow => !!r)
      if (vectors.length) state.copied += await pg.store.upsert(vectors)
      if (rows.length) state.cursor = rows[rows.length - 1].id
      if (rows.length < batch) state.phase = 'prune'
      lease()
      await saveState(state)
    }
    while (state.phase === 'prune' && more()) {
      const ids = await pg.store.listIds(model, state.prune_cursor, 1000)
      if (ids.length) {
        const live = new Set((await chunks.find({ ...scope, id: { $in: ids } }, { projection: { _id: 0, id: 1 } }).toArray()).map((r) => r.id))
        const gone = ids.filter((id) => !live.has(id))
        if (gone.length) state.pruned += await pg.store.deleteIds(model, gone)
        state.prune_cursor = ids[ids.length - 1]
      }
      if (ids.length < 1000) state.phase = 'outbox'
      lease()
      await saveState(state)
    }
    while (state.phase === 'outbox' && more()) {
      const r = await drainVectorOutbox({ limit: 500, budgetMs: Math.max(1_000, deadline - Date.now()) })
      // Items that keep failing don't block completion; the tick keeps retrying them.
      if (r.remaining === 0 || r.synced === 0) state.phase = 'done'
      lease()
      await saveState(state)
    }
    if (state.phase === 'done') {
      state.status = 'complete'
      state.completed_at = nowIso()
      state.last_error = null
      resetVectorStoreCaches()
    }
  } catch (e) {
    state.last_error = (e as Error).message.slice(0, 300)
    throw e
  } finally {
    state.lease_until = null
    await saveState(state).catch(() => {})
  }
  return { dry_run: false, done: state.status === 'complete', state }
}

/** Scheduler tick: continue an unfinished backfill whose lease expired. */
export async function continueBackfill(budgetMs = 20_000): Promise<boolean> {
  const pg = await pgvectorStore().catch(() => null)
  if (!pg) return false
  const meta = await ragMeta()
  const rows = await meta.find({ key: { $regex: `^${BACKFILL_KEY_PREFIX}` } } as never).limit(10).toArray()
  const now = new Date().toISOString()
  for (const r of rows) {
    const s = r.value as BackfillState
    if (s?.status !== 'running' || s.target !== pg.fingerprint || (s.lease_until && s.lease_until > now)) continue
    await runBackfill({ model: s.model, budgetMs })
    return true
  }
  return false
}

export interface VectorStoreStatus {
  want: 'mongo' | 'pgvector'
  configured: boolean
  config_error: string | null
  host: string | null
  model: string | null
  reads: 'mongo' | 'pgvector'
  backfill: BackfillState | null
  outbox: number
}

export async function vectorStoreStatus(): Promise<VectorStoreStatus> {
  const cfg = await readVectorStoreConfig()
  const pg = await pgvectorStore().catch(() => null)
  const model = await dominantEmbeddingModel()
  const state = model ? await readBackfillState(model) : null
  const reads = model && (await vectorReadStore(model)) ? 'pgvector' : 'mongo'
  return {
    want: cfg.want,
    configured: !!pg,
    config_error: cfg.error,
    host: pg?.host ?? null,
    model,
    reads,
    backfill: state,
    outbox: pg ? await outboxCount() : 0,
  }
}
