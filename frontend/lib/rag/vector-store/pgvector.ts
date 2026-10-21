/**
 * Postgres + pgvector vector store.
 *
 * Layout: one table per embedding model (`vector(N)` needs a fixed N; N comes
 * from lib/rag/embed EMBED_MODELS), listed in `rag_vector_tables`:
 *
 *   rag_vectors_<model slug> (
 *     id text PK (chunk id), source_type, source_id, tenant_key, tenant_id,
 *     visibility, chunk_index, text_hash, embedding_model,
 *     embedding vector(N), metadata jsonb, updated_at timestamptz)
 *   indexes: HNSW (embedding vector_cosine_ops), btree (tenant_key, visibility,
 *            source_type), btree (source_type, source_id, chunk_index)
 *
 * The same DDL ships as lib/rag/vector-store/migrations/001_rag_vectors.sql (for the default
 * model); `ensureSchema` is idempotent and runs it on first use.
 *
 * Search applies the lib/rag/acl.ts filter in the WHERE clause (./sql-filter)
 * and orders by cosine distance with LIMIT k. pgvector ≥ 0.8 iterative index
 * scans (`hnsw.iterative_scan = strict_order`) keep the HNSW scan going until
 * k rows pass the filter, so a small tenant still gets its full k results —
 * nothing is filtered in app code after LIMIT. Every value is a bound parameter;
 * identifiers come from a validated slug.
 */
import { EMBED_MODELS } from '../embed'
import { aclFilterToSql } from './sql-filter'
import type { PgClientLike, PgPoolLike, PgQueryable } from './pg-pool'
import type { ScoredId, VectorQuery, VectorRow, VectorStore } from './types'

export const MIN_PGVECTOR_VERSION = '0.8.0'
/** pgvector's HNSW limit for the `vector` type. */
export const MAX_HNSW_DIMS = 2000
export const REGISTRY_TABLE = 'rag_vector_tables'
const SCHEMA_LOCK_KEY = 724_113_001
const UPSERT_BATCH = 200
const COLS = ['id', 'source_type', 'source_id', 'tenant_key', 'tenant_id', 'visibility', 'chunk_index', 'text_hash', 'embedding_model', 'embedding', 'metadata', 'updated_at'] as const

export function defaultEfSearch(raw: string | undefined): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 10 ? Math.min(1000, n) : 100
}

/** `text-embedding-3-small` → `rag_vectors_text_embedding_3_small` (pure, validated). */
export function tableNameFor(model: string): string {
  const slug = String(model).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48)
  if (!slug) throw new Error(`vector store: invalid embedding model name ${JSON.stringify(model)}`)
  const name = `rag_vectors_${slug}`
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`vector store: invalid table name ${name}`)
  return name
}

export function dimsFor(model: string, fallback?: number): number {
  const d = EMBED_MODELS[model]?.dims ?? fallback
  if (!Number.isInteger(d) || (d as number) < 1) throw new Error(`vector store: unknown dimensions for ${model}`)
  if ((d as number) > MAX_HNSW_DIMS) throw new Error(`vector store: ${model} has ${d} dimensions; HNSW on vector supports at most ${MAX_HNSW_DIMS}`)
  return d as number
}

/** DDL for one model (idempotent). Also the source of lib/rag/vector-store/migrations/001_rag_vectors.sql. */
export function schemaStatements(model: string, dims: number): string[] {
  const t = tableNameFor(model)
  const n = dimsFor(model, dims)
  return [
    `CREATE TABLE IF NOT EXISTS ${REGISTRY_TABLE} (
  model text PRIMARY KEY,
  table_name text NOT NULL UNIQUE,
  dims integer NOT NULL CHECK (dims > 0),
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `CREATE TABLE IF NOT EXISTS "${t}" (
  id text PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  tenant_key text NOT NULL,
  tenant_id text,
  visibility text NOT NULL,
  chunk_index integer NOT NULL,
  text_hash text NOT NULL,
  embedding_model text NOT NULL,
  embedding vector(${n}) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
    `CREATE INDEX IF NOT EXISTS "${t}_hnsw" ON "${t}" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`,
    `CREATE INDEX IF NOT EXISTS "${t}_acl" ON "${t}" (tenant_key, visibility, source_type)`,
    `CREATE INDEX IF NOT EXISTS "${t}_source" ON "${t}" (source_type, source_id, chunk_index)`,
  ]
}

export function versionAtLeast(have: string, want: string): boolean {
  const a = have.split('.').map((x) => parseInt(x, 10) || 0)
  const b = want.split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return true
}

export function vectorLiteral(v: readonly number[], dims: number): string {
  if (!Array.isArray(v) || v.length !== dims) throw new Error(`vector store: expected ${dims} dimensions, got ${Array.isArray(v) ? v.length : 'none'}`)
  for (const x of v) if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error('vector store: non-finite vector component')
  return `[${v.join(',')}]`
}

async function inTransaction<T>(pool: PgPoolLike, fn: (c: PgClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export interface RegisteredTable { model: string; table_name: string; dims: number }

export class PgVectorStore implements VectorStore {
  readonly kind = 'pgvector' as const
  private schema = new Map<string, Promise<RegisteredTable>>()
  private efSearch: number
  /** Read-path registry cache (a table created elsewhere shows up within a minute). */
  private readCache: { at: number; tables: RegisteredTable[] } | null = null

  constructor(private pool: PgPoolLike, opts: { efSearch?: number } = {}) {
    this.efSearch = opts.efSearch ?? defaultEfSearch(process.env.PGVECTOR_EF_SEARCH)
  }

  /** Installed pgvector version, or null when the extension is missing. */
  async extensionVersion(q: PgQueryable = this.pool): Promise<string | null> {
    const r = await q.query(`/* rag:ext-version */ SELECT extversion FROM pg_extension WHERE extname = 'vector'`)
    return (r.rows[0]?.extversion as string | undefined) ?? null
  }

  async tables(): Promise<RegisteredTable[]> {
    const exists = await this.pool.query(`/* rag:registry-exists */ SELECT to_regclass($1) AS t`, [REGISTRY_TABLE])
    if (!exists.rows[0]?.t) return []
    const r = await this.pool.query(`/* rag:registry */ SELECT model, table_name, dims FROM ${REGISTRY_TABLE} ORDER BY model`)
    return r.rows.map((x) => ({ model: String(x.model), table_name: String(x.table_name), dims: Number(x.dims) }))
  }

  async tableFor(model: string): Promise<RegisteredTable | null> {
    return (await this.tables()).find((t) => t.model === model) ?? null
  }

  /** Idempotent: extension (if allowed), registry, the model's table and indexes. */
  ensureSchema(model: string, dims?: number): Promise<RegisteredTable> {
    const hit = this.schema.get(model)
    if (hit) return hit
    const p = this.createSchema(model, dims)
    this.schema.set(model, p)
    p.catch(() => this.schema.delete(model))
    return p
  }

  private async createSchema(model: string, dimsHint?: number): Promise<RegisteredTable> {
    const dims = dimsFor(model, dimsHint)
    const table = tableNameFor(model)
    return inTransaction(this.pool, async (c) => {
      await c.query(`/* rag:schema-lock */ SELECT pg_advisory_xact_lock($1)`, [SCHEMA_LOCK_KEY])
      let version = await this.extensionVersion(c)
      if (!version) {
        // Needs CREATE privilege on the database; managed hosts: enable "vector" in the console first.
        await c.query('/* rag:ext-create */ CREATE EXTENSION IF NOT EXISTS vector')
        version = await this.extensionVersion(c)
      }
      if (!version || !versionAtLeast(version, MIN_PGVECTOR_VERSION)) {
        throw new Error(`pgvector ${MIN_PGVECTOR_VERSION}+ is required (installed: ${version ?? 'none'}); iterative HNSW scans keep ACL-filtered results complete`)
      }
      for (const sql of schemaStatements(model, dims)) await c.query(`/* rag:ddl */ ${sql}`)
      await c.query(
        `/* rag:registry-insert */ INSERT INTO ${REGISTRY_TABLE} (model, table_name, dims) VALUES ($1, $2, $3) ON CONFLICT (model) DO NOTHING`,
        [model, table, dims],
      )
      const r = await c.query(`/* rag:registry-get */ SELECT model, table_name, dims FROM ${REGISTRY_TABLE} WHERE model = $1`, [model])
      const row = r.rows[0]
      if (!row || Number(row.dims) !== dims || row.table_name !== table) {
        throw new Error(`vector store: ${model} is registered as ${row?.table_name}/${row?.dims} dims, expected ${table}/${dims}`)
      }
      this.readCache = null
      return { model, table_name: table, dims }
    })
  }

  private async readTable(model: string): Promise<RegisteredTable | null> {
    if (!this.readCache || Date.now() - this.readCache.at > 60_000) this.readCache = { at: Date.now(), tables: await this.tables() }
    return this.readCache.tables.find((t) => t.model === model) ?? null
  }

  async search(q: VectorQuery): Promise<ScoredId[]> {
    const t = await this.readTable(q.model)
    if (!t) return []
    const k = Math.max(1, Math.min(200, Math.floor(q.k)))
    const vec = vectorLiteral(q.vector, t.dims)
    const where = aclFilterToSql(q.filter, 3)
    const rows = await inTransaction(this.pool, async (c) => {
      await c.query(
        `/* rag:search-settings */ SELECT set_config('hnsw.ef_search', $1, true), set_config('hnsw.iterative_scan', 'strict_order', true)`,
        [String(Math.max(this.efSearch, k))],
      )
      const r = await c.query(
        `/* rag:search */ SELECT id, 1 - (embedding <=> $1::vector) AS score FROM "${t.table_name}" WHERE ${where.sql} ORDER BY embedding <=> $1::vector LIMIT $2`,
        [vec, k, ...where.params],
      )
      return r.rows
    })
    return rows
      .map((r, i) => ({ id: String(r.id), score: Number(r.score), i }))
      // Same tie order as the Mongo scan (id ascending); the index can't sort by a second key.
      .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : a.i - b.i))
      .filter((r) => r.score >= q.minScore)
      .map(({ id, score }) => ({ id, score }))
  }

  private async insertRows(c: PgQueryable, t: RegisteredTable, rows: readonly VectorRow[]): Promise<number> {
    let n = 0
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const batch = rows.slice(i, i + UPSERT_BATCH)
      const params: unknown[] = []
      const values = batch.map((r) => {
        if (r.embedding_model !== t.model) throw new Error(`vector store: row ${r.id} is ${r.embedding_model}, table is ${t.model}`)
        const base = params.length
        params.push(
          r.id, r.source_type, r.source_id, r.tenant_key, r.tenant_id, r.visibility, Math.floor(r.chunk_index),
          r.text_hash, r.embedding_model, vectorLiteral(r.embedding, t.dims), JSON.stringify(r.metadata ?? {}), r.updated_at,
        )
        const ph = COLS.map((col, j) => `$${base + j + 1}${col === 'embedding' ? '::vector' : col === 'metadata' ? '::jsonb' : col === 'updated_at' ? '::timestamptz' : ''}`)
        return `(${ph.join(', ')})`
      })
      const update = COLS.filter((col) => col !== 'id').map((col) => `${col} = EXCLUDED.${col}`).join(', ')
      await c.query(
        `/* rag:upsert */ INSERT INTO "${t.table_name}" (${COLS.join(', ')}) VALUES ${values.join(', ')} ON CONFLICT (id) DO UPDATE SET ${update}`,
        params,
      )
      n += batch.length
    }
    return n
  }

  async upsert(rows: VectorRow[]): Promise<number> {
    const byModel = new Map<string, VectorRow[]>()
    for (const r of rows) byModel.set(r.embedding_model, [...(byModel.get(r.embedding_model) ?? []), r])
    let n = 0
    for (const [model, list] of byModel) {
      const t = await this.ensureSchema(model, list[0].embedding.length)
      n += await this.insertRows(this.pool, t, list)
    }
    return n
  }

  async replaceSource(sourceType: string, sourceId: string, rows: VectorRow[]): Promise<void> {
    const models = new Set(rows.map((r) => r.embedding_model))
    if (models.size > 1) throw new Error('vector store: one source must use one embedding model')
    const target = rows.length ? await this.ensureSchema(rows[0].embedding_model, rows[0].embedding.length) : null
    const tables = await this.tables()
    if (!tables.length && !target) return
    await inTransaction(this.pool, async (c) => {
      for (const t of tables) {
        await c.query(`/* rag:delete-source */ DELETE FROM "${t.table_name}" WHERE source_type = $1 AND source_id = $2`, [sourceType, sourceId])
      }
      if (target && rows.length) await this.insertRows(c, target, rows)
    })
  }

  async deleteSource(sourceType: string, sourceId: string): Promise<void> {
    await this.replaceSource(sourceType, sourceId, [])
  }

  async count(model: string): Promise<number> {
    const t = await this.tableFor(model)
    if (!t) return 0
    const r = await this.pool.query(`/* rag:count */ SELECT count(*)::bigint AS n FROM "${t.table_name}"`)
    return Number(r.rows[0]?.n ?? 0)
  }

  /** Chunk ids in id order after `afterId` (backfill prune phase). */
  async listIds(model: string, afterId: string | null, limit: number): Promise<string[]> {
    const t = await this.tableFor(model)
    if (!t) return []
    const r = await this.pool.query(
      `/* rag:list-ids */ SELECT id FROM "${t.table_name}" WHERE id > $1 ORDER BY id LIMIT $2`,
      [afterId ?? '', Math.max(1, Math.min(5000, Math.floor(limit)))],
    )
    return r.rows.map((x) => String(x.id))
  }

  async deleteIds(model: string, ids: string[]): Promise<number> {
    const t = await this.tableFor(model)
    if (!t || !ids.length) return 0
    const r = await this.pool.query(`/* rag:delete-ids */ DELETE FROM "${t.table_name}" WHERE id = ANY($1::text[])`, [ids])
    return r.rowCount ?? 0
  }
}
