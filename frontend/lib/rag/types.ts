/**
 * Internal knowledge-layer types (the shared ones live in lib/agent/contract.ts).
 */
import type { KnowledgeChunk, KnowledgeSourceType, KnowledgeVisibility } from '@/lib/agent/contract'

export type { KnowledgeChunk, KnowledgeSourceType, KnowledgeVisibility }

export const KNOWLEDGE_SOURCE_TYPES: readonly KnowledgeSourceType[] = [
  'problem', 'question', 'course', 'doc', 'test', 'test_result_summary',
  'hackathon', 'codeathon', 'upload', 'resume', 'attempt_summary', 'marketplace_product', 'external_event',
]

/** Types that carry candidate data or answer keys: staff (admins) only, never public. */
export const STAFF_ONLY_TYPES: ReadonlySet<KnowledgeSourceType> = new Set(['resume', 'attempt_summary', 'question'])

/** Types a tenant admin may reindex for their own organisation. */
export const TENANT_TYPES: readonly KnowledgeSourceType[] = [
  'test', 'test_result_summary', 'hackathon', 'codeathon', 'upload', 'resume', 'attempt_summary',
]

export const SOURCE_TYPE_LABELS: Record<KnowledgeSourceType, string> = {
  problem: 'Problem',
  question: 'Question bank',
  course: 'Course',
  doc: 'Help and docs',
  test: 'Test',
  test_result_summary: 'Test results',
  hackathon: 'Hackathon',
  codeathon: 'Codeathon',
  upload: 'Upload',
  resume: 'Résumé',
  attempt_summary: 'Candidate attempt',
  marketplace_product: 'Marketplace product',
  external_event: 'Events feed',
}

export function isKnowledgeSourceType(v: unknown): v is KnowledgeSourceType {
  return typeof v === 'string' && (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(v)
}

/** What a source extractor produces: one logical document, before chunking. */
export interface ExtractedSource {
  type: KnowledgeSourceType
  source_id: string
  tenant_id: string | null
  visibility: KnowledgeVisibility
  title: string
  url: string | null
  /** Markdown text that gets chunked + indexed. Never answer keys / hidden tests. */
  text: string
  /** Not searchable, never returned to callers by search. */
  metadata?: Record<string, unknown>
  /** Per-source chunking (part of the content hash, so a change re-chunks). */
  chunk?: { splitOnSection?: boolean }
}

export type SourceStatus = 'queued' | 'indexing' | 'ready' | 'failed'

/** rag_sources: one row per source (index state + queue). */
export interface RagSourceDoc {
  /** `${type}:${source_id}` */
  id: string
  type: KnowledgeSourceType
  source_id: string
  tenant_id: string | null
  /** tenant_id ?? PLATFORM_TENANT_KEY — string-only key for filters (Atlas vector filters and $in). */
  tenant_key: string
  visibility?: KnowledgeVisibility
  title: string
  url: string | null
  status: SourceStatus
  error: string | null
  chunk_count: number
  content_hash: string | null
  embedding_model: string | null
  /** Set when the source was indexed without vectors (no embedding provider). */
  embedding_missing?: boolean
  /** Re-embed even when the content is unchanged. */
  force?: boolean
  queued_at?: string | null
  locked_until?: string | null
  attempts?: number
  indexed_at?: string | null
  updated_at: string
  tags?: string[]
}

/** rag_chunks row: the contract chunk plus the string tenant key used for filtering. */
export type RagChunkDoc = KnowledgeChunk & { tenant_key: string; section?: string[] }

export const PLATFORM_TENANT_KEY = '_platform'

export function tenantKey(tenantId: string | null | undefined): string {
  return tenantId ? String(tenantId) : PLATFORM_TENANT_KEY
}

export function sourceKey(type: KnowledgeSourceType, sourceId: string): string {
  return `${type}:${sourceId}`
}
