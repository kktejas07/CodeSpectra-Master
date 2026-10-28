/**
 * Index health for the knowledge page (superadmin): sources by status, failed
 * sources with their errors, stale sources (> 7 days since indexed), embedding
 * model mix, chunks without embeddings, stuck queue rows and chunk sizes.
 * Platform-wide — callers must be superadmin.
 */
import type { Filter } from 'mongodb'
import { ragChunks, ragSources } from '../store'
import { CHARS_PER_TOKEN } from '../chunk'
import { KNOWLEDGE_SOURCE_TYPES, type RagSourceDoc } from '../types'

export const STALE_DAYS = 7

export interface IndexHealth {
  generated_at: string
  sources: number
  by_status: Record<string, number>
  by_type: { type: string; sources: number; ready: number; failed: number; chunks: number }[]
  failed: { id: string; type: string; title: string; error: string | null; updated_at: string | null }[]
  stale: { count: number; sample: { id: string; type: string; title: string; indexed_at: string | null }[] }
  stuck_indexing: number
  embedding_models: { model: string | null; chunks: number; avg_tokens: number }[]
  chunks: number
  chunks_without_embeddings: number
  sources_keyword_only: number
}

type Row = Record<string, unknown>
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? null : String(v))

export async function indexHealth(now = new Date()): Promise<IndexHealth> {
  const [sources, chunks] = await Promise.all([ragSources(), ragChunks()])
  const staleBefore = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString()
  const staleFilter: Filter<RagSourceDoc> = { status: 'ready', $or: [{ indexed_at: { $lt: staleBefore } }, { indexed_at: null }] }

  const [byStatus, byType, failed, staleCount, staleSample, stuck, models, keywordOnly] = await Promise.all([
    sources.aggregate<{ _id: string; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    sources.aggregate<{ _id: string; sources: number; ready: number; failed: number; chunks: number }>([
      { $group: {
        _id: '$type', sources: { $sum: 1 }, chunks: { $sum: '$chunk_count' },
        ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      } },
    ]).toArray(),
    sources.find({ status: 'failed' }, { projection: { _id: 0, id: 1, type: 1, title: 1, source_id: 1, error: 1, updated_at: 1 } })
      .sort({ updated_at: -1 }).limit(20).toArray(),
    sources.countDocuments(staleFilter),
    sources.find(staleFilter, { projection: { _id: 0, id: 1, type: 1, title: 1, source_id: 1, indexed_at: 1 } })
      .sort({ indexed_at: 1 }).limit(10).toArray(),
    sources.countDocuments({ status: 'indexing', locked_until: { $lt: now.toISOString() } }),
    chunks.aggregate<{ _id: string | null; n: number; chars: number | null }>([
      { $group: { _id: { $ifNull: ['$embedding_model', null] }, n: { $sum: 1 }, chars: { $avg: { $strLenCP: { $ifNull: ['$text', ''] } } } } },
      { $sort: { n: -1 } },
    ]).toArray(),
    sources.countDocuments({ embedding_missing: true }),
  ])

  const order = new Map(KNOWLEDGE_SOURCE_TYPES.map((t, i) => [t as string, i]))
  const totalChunks = models.reduce((n, m) => n + m.n, 0)
  const title = (r: Row) => s(r.title) || s(r.source_id) || s(r.id) || ''
  return {
    generated_at: now.toISOString(),
    sources: byStatus.reduce((n, r) => n + r.n, 0),
    by_status: Object.fromEntries(byStatus.map((r) => [r._id ?? 'unknown', r.n])),
    by_type: byType
      .map((r) => ({ type: r._id, sources: r.sources, ready: r.ready, failed: r.failed, chunks: r.chunks }))
      .sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99)),
    failed: (failed as Row[]).map((r) => ({ id: s(r.id) ?? '', type: s(r.type) ?? '', title: title(r), error: s(r.error), updated_at: s(r.updated_at) })),
    stale: {
      count: staleCount,
      sample: (staleSample as Row[]).map((r) => ({ id: s(r.id) ?? '', type: s(r.type) ?? '', title: title(r), indexed_at: s(r.indexed_at) })),
    },
    stuck_indexing: stuck,
    embedding_models: models.map((m) => ({ model: m._id ?? null, chunks: m.n, avg_tokens: Math.round((m.chars ?? 0) / CHARS_PER_TOKEN) })),
    chunks: totalChunks,
    chunks_without_embeddings: models.filter((m) => !m._id).reduce((n, m) => n + m.n, 0),
    sources_keyword_only: keywordOnly,
  }
}
