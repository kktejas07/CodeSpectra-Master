/**
 * searchKnowledge (lib/agent/contract.ts): hybrid retrieval over rag_chunks.
 *
 *  1. ACL filter (lib/rag/acl.ts) is part of EVERY query — vector, keyword and
 *     the text fetch — so nothing outside the caller's scope is ever read.
 *  2. Vector: the query is embedded with the corpus's model; only vectors of
 *     that same model are compared (never mixed dims).
 *       - MongoDB Atlas $vectorSearch when the index below exists and is
 *         queryable (detected once, re-checked every 10 minutes), else
 *       - in-process cosine over a prefiltered, capped candidate set.
 *  3. Keyword: $text (weights in store.ts CHUNK_TEXT_INDEX).
 *  4. Reciprocal rank fusion, one hit per source, highlighted snippet.
 *
 * ── Atlas Vector Search setup (optional) ───────────────────────────────────
 * Atlas cluster (M10+ or Flex/serverless with Search). The app tries to create
 * this index itself on first search (needs a user with createSearchIndexes);
 * otherwise create it in Atlas → Search → Create index → JSON editor, on
 * collection `rag_chunks`, name `rag_chunks_vector` (or RAG_ATLAS_VECTOR_INDEX):
 *
 *   {
 *     "fields": [
 *       { "type": "vector", "path": "embedding", "numDimensions": 1536, "similarity": "cosine" },
 *       { "type": "filter", "path": "tenant_key" },
 *       { "type": "filter", "path": "visibility" },
 *       { "type": "filter", "path": "source_type" },
 *       { "type": "filter", "path": "embedding_model" }
 *     ]
 *   }
 *
 * 1536 dims = text-embedding-3-small (OpenAI / OpenRouter). Corpora embedded
 * with Gemini (768 dims) use the in-process path. Set RAG_ATLAS_VECTOR=0 to
 * turn the Atlas path off.
 */
import type { AgentCaller, KnowledgeHit, KnowledgeSearchArgs } from '@/lib/agent/contract'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { andFilters, canSeeChunk, knowledgeAclFilter, MATCH_NOTHING, type AclFilter } from './acl'
import { embedTexts, EMBED_MODELS, OPENAI_EMBED_MODEL } from './embed'
import { cosine, dedupeBySource, highlightSnippet, reciprocalRankFusion } from './fusion'
import { dominantEmbeddingModel } from './ingest'
import { ragChunks } from './store'
import type { RagChunkDoc } from './types'

export const ATLAS_VECTOR_INDEX = process.env.RAG_ATLAS_VECTOR_INDEX || 'rag_chunks_vector'
export const ATLAS_VECTOR_MODEL = OPENAI_EMBED_MODEL

export const ATLAS_VECTOR_DEFINITION = {
  fields: [
    { type: 'vector', path: 'embedding', numDimensions: EMBED_MODELS[OPENAI_EMBED_MODEL].dims, similarity: 'cosine' },
    { type: 'filter', path: 'tenant_key' },
    { type: 'filter', path: 'visibility' },
    { type: 'filter', path: 'source_type' },
    { type: 'filter', path: 'embedding_model' },
  ],
}

const PER_LIST = 40
/**
 * RAG-010 / W4-07: the in-process path scans the chunk vectors in the caller's
 * ACL scope (pre-filtered in the query by tenant / visibility / source type /
 * embedding model), in id-ordered batches, keeping only a running top-K so
 * memory stays flat. RAG_INPROC_MAX_SCAN bounds the work per query — default
 * 5,000 chunks (~30 MB of vectors read from Mongo); above that, create the
 * Atlas vector index (admins get an alert — lib/rag/ingest vectorHealthAlert).
 */
export const DEFAULT_INPROC_MAX_SCAN = 5_000
export function inprocMaxScan(raw: string | undefined): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? Math.max(500, Math.min(200_000, n)) : DEFAULT_INPROC_MAX_SCAN
}
export const INPROC_MAX_SCAN = inprocMaxScan(process.env.RAG_INPROC_MAX_SCAN)
const INPROC_BATCH = 2000
const MIN_COSINE = 0.2

let atlas: { ok: boolean; at: number } | null = null
let warnedCapped = false

/** Is Atlas $vectorSearch usable on rag_chunks? Creates the index when the cluster supports it. */
export async function atlasVectorAvailable(): Promise<boolean> {
  if (process.env.RAG_ATLAS_VECTOR === '0') return false
  if (atlas && Date.now() - atlas.at < 10 * 60_000) return atlas.ok
  let ok = false
  try {
    const col = await ragChunks()
    const found = await col.listSearchIndexes(ATLAS_VECTOR_INDEX).toArray()
    if (!found.length) {
      await col.createSearchIndex({ name: ATLAS_VECTOR_INDEX, type: 'vectorSearch', definition: ATLAS_VECTOR_DEFINITION })
        .catch((e) => console.warn('[rag] could not create the Atlas vector index (see lib/rag/search.ts):', (e as Error).message))
    } else {
      const idx = found[0] as { queryable?: boolean; status?: string }
      ok = idx.queryable === true || idx.status === 'READY'
    }
  } catch {
    ok = false // not Atlas (or no Search): in-process path
  }
  atlas = { ok, at: Date.now() }
  return ok
}

type Scored = { id: string; score: number }

async function keywordSearch(filter: AclFilter, query: string): Promise<Scored[]> {
  try {
    const col = await ragChunks()
    const rows = await col
      .find(andFilters(filter, { $text: { $search: query.slice(0, 300) } }), { projection: { _id: 0, id: 1, score: { $meta: 'textScore' } } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(PER_LIST)
      .toArray()
    return rows.map((r) => ({ id: r.id, score: Number((r as unknown as { score: number }).score) || 0 }))
  } catch (e) {
    console.warn('[rag] keyword search failed:', (e as Error).message)
    return []
  }
}

/** Keep the best `k` scores (descending) — pure, used by the streaming scan. */
export function pushTopK(top: Scored[], item: Scored, k: number): void {
  if (top.length >= k && item.score <= top[top.length - 1].score) return
  let i = top.length
  while (i > 0 && top[i - 1].score < item.score) i--
  top.splice(i, 0, item)
  if (top.length > k) top.pop()
}

/** Batched in-process cosine over the whole ACL-scoped candidate set (no recency cap). */
export async function scanVectors(
  fetchBatch: (afterId: string | null, n: number) => Promise<{ id: string; embedding?: number[] }[]>,
  qv: number[],
  opts: { k?: number; maxScan?: number; batch?: number; minScore?: number } = {},
): Promise<{ hits: Scored[]; scanned: number; capped: boolean }> {
  const k = opts.k ?? PER_LIST
  const maxScan = opts.maxScan ?? INPROC_MAX_SCAN
  const batch = opts.batch ?? INPROC_BATCH
  const min = opts.minScore ?? MIN_COSINE
  const top: Scored[] = []
  let after: string | null = null
  let scanned = 0
  for (;;) {
    const rows = await fetchBatch(after, Math.min(batch, maxScan - scanned))
    for (const r of rows) {
      if (!Array.isArray(r.embedding)) continue
      const score = cosine(qv, r.embedding)
      if (score >= min) pushTopK(top, { id: r.id, score }, k)
    }
    scanned += rows.length
    if (rows.length < batch || !rows.length) return { hits: top, scanned, capped: false }
    if (scanned >= maxScan) return { hits: top, scanned, capped: true }
    after = rows[rows.length - 1].id
  }
}

/** Vector hits, or null when vectors are unavailable (keyword-only). */
async function vectorSearch(filter: AclFilter, query: string, caller: AgentCaller): Promise<Scored[] | null> {
  const corpusModel = await dominantEmbeddingModel()
  // RAG-011: no corpus vectors, or the corpus model can't embed the query → keyword only
  // (never embed with another model: its vectors would match nothing).
  if (!corpusModel) return null
  const emb = await embedTexts([query], { onlyModels: [corpusModel], feature: 'rag_search', userId: caller.userId })
  if (!emb) {
    console.warn(`[rag] query embedding with ${corpusModel} unavailable — keyword-only search`)
    return null
  }
  const qv = emb.vectors[0]
  const scoped: AclFilter = andFilters(filter, { embedding_model: emb.model })
  const col = await ragChunks()

  if (emb.model === ATLAS_VECTOR_MODEL && (await atlasVectorAvailable())) {
    try {
      const rows = await col.aggregate<{ id: string; score: number }>([
        { $vectorSearch: { index: ATLAS_VECTOR_INDEX, path: 'embedding', queryVector: qv, numCandidates: PER_LIST * 8, limit: PER_LIST, filter: scoped } },
        { $project: { _id: 0, id: 1, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray()
      return rows.map((r) => ({ id: r.id, score: r.score }))
    } catch (e) {
      console.warn('[rag] $vectorSearch failed, using in-process search:', (e as Error).message)
      atlas = { ok: false, at: Date.now() }
    }
  }

  const { hits, capped, scanned } = await scanVectors(
    async (afterId, n) => (await col
      .find(andFilters(scoped, afterId !== null ? { id: { $gt: afterId } } : {}), { projection: { _id: 0, id: 1, embedding: 1 } })
      .sort({ id: 1 })
      .limit(n)
      .toArray()) as { id: string; embedding?: number[] }[],
    qv,
  )
  if (capped && !warnedCapped) {
    warnedCapped = true
    console.warn(`[rag] in-process vector scan capped at ${scanned} chunks (RAG_INPROC_MAX_SCAN) — create the Atlas vector index for full recall`)
  }
  return hits
}

function bodyOf(text: string): string {
  const i = text.indexOf('\n\n')
  return i >= 0 ? text.slice(i + 2) : text
}

export async function searchKnowledge(args: KnowledgeSearchArgs): Promise<KnowledgeHit[]> {
  const { caller } = args
  const query = String(args.query ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!query) return []
  const limit = Math.max(1, Math.min(20, Math.floor(Number(args.limit) || 8)))
  // tenantId narrowing is a superadmin-only option; tenant admins are always their own tenant.
  const filter = knowledgeAclFilter(caller, { types: args.types, tenantId: caller.role === 'superadmin' ? args.tenantId ?? null : null })
  if (filter === MATCH_NOTHING) return []

  const scan = scanPrompt(query)
  if (scan.flagged) console.warn(`[rag] search query flagged (${scan.reasons.slice(0, 3).join(', ')}) — treated as a plain query`)

  const [vectorOrNull, keyword] = await Promise.all([
    vectorSearch(filter, query, caller).catch((e) => {
      console.warn('[rag] vector search failed:', (e as Error).message)
      return null
    }),
    keywordSearch(filter, query),
  ])
  const retrieval: 'hybrid' | 'keyword_only' = vectorOrNull ? 'hybrid' : 'keyword_only'
  const vector = vectorOrNull ?? []
  const fused = reciprocalRankFusion([vector.map((v) => v.id), keyword.map((k) => k.id)]).slice(0, PER_LIST * 2)
  if (!fused.length) return []

  // Fetch text for the fused ids — still under the ACL filter.
  const col = await ragChunks()
  const rows = await col
    .find(andFilters(filter, { id: { $in: fused.map((f) => f.id) } }), { projection: { _id: 0, embedding: 0 } })
    .toArray()
  const byId = new Map(rows.map((r) => [r.id, r as RagChunkDoc]))
  const ranked = fused
    .map((f) => ({ f, row: byId.get(f.id) }))
    .filter((x): x is { f: { id: string; score: number }; row: RagChunkDoc } => !!x.row && canSeeChunk(caller, x.row, caller.role === 'superadmin' ? args.tenantId ?? null : null))
    .map(({ f, row }) => ({ ...row, _score: f.score }))

  return dedupeBySource(ranked).slice(0, limit).map((r) => ({
    chunk_id: r.id,
    source_type: r.source_type,
    source_id: r.source_id,
    title: r.title,
    url: r.url,
    snippet: highlightSnippet(bodyOf(r.text), query),
    score: Math.round(r._score * 10_000) / 10_000,
    retrieval,
  }))
}
