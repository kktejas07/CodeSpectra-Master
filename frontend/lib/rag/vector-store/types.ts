/**
 * Pluggable vector store for the knowledge layer (lib/rag).
 *
 * The text, ACL fields and keyword ($text) index always live in Mongo
 * `rag_chunks`; a vector store only supplies the VECTOR leg of hybrid search
 * (fusion.ts RRF merges it with the keyword leg). Two implementations:
 *
 *   mongo     default — embeddings on the rag_chunks rows, Atlas $vectorSearch
 *             or the in-process cosine scan (lib/rag/search.ts, unchanged).
 *   pgvector  Postgres + pgvector (./pgvector.ts) — one table per embedding
 *             model, HNSW cosine index, the ACL filter translated to SQL.
 *
 * Every search takes the ACL filter built by lib/rag/acl.ts and must apply it
 * INSIDE the query (never by trimming results after LIMIT).
 */
import type { AclFilter } from '../acl'

export type VectorStoreKind = 'mongo' | 'pgvector'

export interface ScoredId {
  id: string
  score: number
}

/** One chunk vector as a store keeps it (no chunk text — that stays in Mongo). */
export interface VectorRow {
  /** Chunk id (`${type}:${source_id}:${chunk_index}`), the upsert key. */
  id: string
  source_type: string
  source_id: string
  tenant_key: string
  tenant_id: string | null
  visibility: string
  chunk_index: number
  /** sha256 of the chunk text (hex, 32 chars): lets a backfill / audit spot stale vectors. */
  text_hash: string
  embedding_model: string
  embedding: number[]
  metadata: Record<string, unknown>
  updated_at: string
}

export interface VectorQuery {
  /** lib/rag/acl.ts filter, already AND-ed with `{ embedding_model }`. */
  filter: AclFilter
  vector: number[]
  model: string
  k: number
  /** Cosine floor (applied to the k best, same as the Mongo scan). */
  minScore: number
}

export interface VectorStore {
  readonly kind: VectorStoreKind
  search(q: VectorQuery): Promise<ScoredId[]>
  /** Replace every vector of one source with `rows` (empty = delete the source's vectors). */
  replaceSource(sourceType: string, sourceId: string, rows: VectorRow[]): Promise<void>
  deleteSource(sourceType: string, sourceId: string): Promise<void>
  /** Idempotent upsert by chunk id (backfill). */
  upsert(rows: VectorRow[]): Promise<number>
  count(model: string): Promise<number>
}
