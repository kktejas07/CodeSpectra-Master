/**
 * Mongo collections for the knowledge layer, with lazily created indexes
 * (same pattern as lib/codeathon-release.ts: build once per process, retry on failure).
 *
 *  rag_chunks   one row per chunk (lib/agent/contract KnowledgeChunk + tenant_key)
 *  rag_sources  one row per source: index state, and the indexing queue (status 'queued')
 *  rag_uploads  company documents uploaded on the knowledge page (extracted text only)
 *  rag_meta     small key/value rows (last nightly sweep, …)
 *
 * Atlas Vector Search (optional): see ATLAS_VECTOR_INDEX in lib/rag/search.ts.
 */
import type { Collection, Db } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import type { RagChunkDoc, RagSourceDoc } from './types'

export interface RagUploadDoc {
  id: string
  tenant_id: string | null
  title: string
  kind: 'jd' | 'rubric' | 'policy' | 'other'
  tags: string[]
  file_name: string
  mime: string
  size: number
  text: string
  scan_status: 'clean'
  prompt_flags: string[]
  uploaded_by: string
  created_at: string
  updated_at: string
}

/**
 * rag_chunks text index weights. The chunk text already starts with the title
 * (chunk header), so a separate title boost over-ranks title-only matches —
 * the offline eval (lib/rag/eval) measured title 1 best (keyword MRR 0.764 →
 * 0.817 vs the old title 5).
 */
export const CHUNK_TEXT_INDEX = { name: 'rag_chunks_text', weights: { title: 1, text: 1 } } as const

type IndexInfo = { name?: string; key?: Record<string, unknown>; weights?: Record<string, number> }

/** Pure: does the collection's existing text index differ from the wanted one? */
export function textIndexOutdated(existing: IndexInfo | undefined, want: { name: string; weights: Record<string, number> }): boolean {
  if (!existing) return false
  if (existing.name !== want.name) return true
  const have = existing.weights ?? {}
  const keys = new Set([...Object.keys(have), ...Object.keys(want.weights)])
  return [...keys].some((k) => have[k] !== want.weights[k])
}

/**
 * Create the text index, or replace it when its definition changed (MongoDB
 * allows one text index per collection and createIndex with new weights fails
 * with IndexOptionsConflict). Safe with several processes booting at once: a
 * drop that lost the race (IndexNotFound) is ignored, and createIndex of an
 * identical index is a no-op. Until it exists again, keyword search returns
 * nothing for a moment (search.ts treats a $text error as no keyword hits).
 */
export async function ensureTextIndex(
  col: Pick<Collection, 'indexes' | 'dropIndex' | 'createIndex'>,
  keys: Record<string, 'text'>,
  want: { name: string; weights: Record<string, number> },
): Promise<void> {
  const list = (await col.indexes().catch(() => [])) as IndexInfo[]
  const current = list.find((i) => i.key && Object.values(i.key).includes('text'))
  if (current && textIndexOutdated(current, want)) {
    await col.dropIndex(current.name as string).catch((e: { code?: number }) => { if (e?.code !== 27) throw e })
    console.info(`[rag] text index ${current.name} replaced (weights ${JSON.stringify(current.weights ?? {})} → ${JSON.stringify(want.weights)})`)
  }
  await col.createIndex(keys, { name: want.name, weights: want.weights, default_language: 'english' })
}

let chunkIdx: Promise<unknown> | null = null
let sourceIdx: Promise<unknown> | null = null
let uploadIdx: Promise<unknown> | null = null

async function db(): Promise<Db> {
  return getMongoDb()
}

export async function ragChunks(): Promise<Collection<RagChunkDoc>> {
  const col = (await db()).collection<RagChunkDoc>('rag_chunks')
  if (!chunkIdx) {
    chunkIdx = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'rag_chunks_id' }),
      col.createIndex({ source_type: 1, source_id: 1, chunk_index: 1 }, { name: 'rag_chunks_source' }),
      col.createIndex({ tenant_key: 1, source_type: 1, embedding_model: 1, updated_at: -1 }, { name: 'rag_chunks_acl' }),
      col.createIndex({ tenant_id: 1 }, { name: 'rag_chunks_tenant' }),
      ensureTextIndex(col as unknown as Collection, { title: 'text', text: 'text' }, { name: CHUNK_TEXT_INDEX.name, weights: { ...CHUNK_TEXT_INDEX.weights } }),
    ]).catch((e) => {
      chunkIdx = null
      console.error('[rag] rag_chunks index build failed', e)
    })
  }
  await chunkIdx
  return col
}

export async function ragSources(): Promise<Collection<RagSourceDoc>> {
  const col = (await db()).collection<RagSourceDoc>('rag_sources')
  if (!sourceIdx) {
    sourceIdx = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'rag_sources_id' }),
      col.createIndex({ type: 1, source_id: 1 }, { unique: true, name: 'rag_sources_type_source' }),
      col.createIndex({ tenant_id: 1, type: 1 }, { name: 'rag_sources_tenant' }),
      col.createIndex({ status: 1, queued_at: 1 }, { name: 'rag_sources_queue' }),
      col.createIndex({ title: 'text' }, { name: 'rag_sources_text' }),
    ]).catch((e) => {
      sourceIdx = null
      console.error('[rag] rag_sources index build failed', e)
    })
  }
  await sourceIdx
  return col
}

export async function ragUploads(): Promise<Collection<RagUploadDoc>> {
  const col = (await db()).collection<RagUploadDoc>('rag_uploads')
  if (!uploadIdx) {
    uploadIdx = Promise.all([
      col.createIndex({ id: 1 }, { unique: true, name: 'rag_uploads_id' }),
      col.createIndex({ tenant_id: 1, created_at: -1 }, { name: 'rag_uploads_tenant' }),
    ]).catch((e) => {
      uploadIdx = null
      console.error('[rag] rag_uploads index build failed', e)
    })
  }
  await uploadIdx
  return col
}

export async function ragMeta(): Promise<Collection<{ key: string; value: unknown; updated_at: string }>> {
  return (await db()).collection<{ key: string; value: unknown; updated_at: string }>('rag_meta')
}
