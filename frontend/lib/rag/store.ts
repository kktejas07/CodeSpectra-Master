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
      col.createIndex({ title: 'text', text: 'text' }, { name: 'rag_chunks_text', weights: { title: 5, text: 1 }, default_language: 'english' }),
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
