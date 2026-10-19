/**
 * Knowledge admin services used by /api/admin/knowledge/* (and the agent tools).
 * Every function takes the AgentCaller built from the server session; tenant
 * admins are always scoped to their own organisation here.
 */
import { randomUUID } from 'crypto'
import type { AgentCaller } from '@/lib/agent/contract'
import type { APIUser } from '@/lib/route-auth'
import { backendPost } from '@/lib/ai/backend'
import { scanPrompt } from '@/lib/ai/prompt-guard'
import { availableEmbedModels } from './embed'
import { enqueueKnowledge, indexSource, removeSource, sweepKnowledge } from './ingest'
import { atlasVectorAvailable } from './search'
import { ragChunks, ragSources, ragUploads, type RagUploadDoc } from './store'
import {
  detectUploadType, extractUploadText, MAX_UPLOAD_BYTES, parseTags, UPLOAD_KINDS, type UploadKind,
} from './sources/uploads'
import {
  isKnowledgeSourceType, KNOWLEDGE_SOURCE_TYPES, TENANT_TYPES, type KnowledgeSourceType, type RagSourceDoc,
} from './types'

export class KnowledgeError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/

/** Session user → agent caller (null for anyone who isn't an admin with a valid scope). */
export function callerFromUser(user: Pick<APIUser, 'id' | 'role' | 'tenantId' | 'name' | 'email'> | null | undefined): AgentCaller | null {
  if (!user) return null
  if (user.role === 'superadmin') return { userId: user.id, role: 'superadmin', tenantId: null, name: user.name, email: user.email }
  if (user.role === 'tenant_admin' && user.tenantId) {
    return { userId: user.id, role: 'tenant_admin', tenantId: user.tenantId, name: user.name, email: user.email }
  }
  return null
}

/** Source-row filter for a caller: tenant admins see only their organisation's rows. */
export function sourceScopeFilter(caller: AgentCaller, tenantParam?: string | null): Record<string, unknown> {
  if (caller.role === 'tenant_admin') return { tenant_id: caller.tenantId }
  const t = (tenantParam || '').trim()
  if (t === 'platform') return { tenant_id: null }
  if (t && TENANT_ID_RE.test(t)) return { tenant_id: t }
  return {}
}

// ─── Listing + stats ─────────────────────────────────────────────────────────

export interface SourceRow {
  id: string
  type: KnowledgeSourceType
  source_id: string
  tenant_id: string | null
  title: string
  url: string | null
  status: RagSourceDoc['status']
  error: string | null
  chunk_count: number
  embedding_model: string | null
  embedding_missing: boolean
  updated_at: string
  indexed_at: string | null
  deletable: boolean
}

function toRow(d: RagSourceDoc): SourceRow {
  return {
    id: d.id,
    type: d.type,
    source_id: d.source_id,
    tenant_id: d.tenant_id ?? null,
    title: d.title || d.source_id,
    url: d.url ?? null,
    status: d.status,
    error: d.error ?? null,
    chunk_count: d.chunk_count ?? 0,
    embedding_model: d.embedding_model ?? null,
    embedding_missing: d.embedding_missing === true,
    updated_at: d.updated_at,
    indexed_at: d.indexed_at ?? null,
    deletable: d.type === 'upload',
  }
}

export async function listSources(caller: AgentCaller, q: {
  type?: string | null; status?: string | null; search?: string | null; tenant?: string | null; page?: number; pageSize?: number
}): Promise<{ rows: SourceRow[]; total: number; page: number; pageSize: number }> {
  const col = await ragSources()
  const filter: Record<string, unknown> = { ...sourceScopeFilter(caller, q.tenant) }
  if (q.type && isKnowledgeSourceType(q.type)) filter.type = q.type
  if (q.status && ['queued', 'indexing', 'ready', 'failed'].includes(q.status)) filter.status = q.status
  const s = (q.search || '').trim().slice(0, 100)
  if (s) filter.title = { $regex: s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
  const pageSize = Math.max(5, Math.min(100, Math.floor(q.pageSize || 25)))
  const page = Math.max(1, Math.floor(q.page || 1))
  const [docs, total] = await Promise.all([
    col.find(filter, { projection: { _id: 0, metadata: 0 } }).sort({ updated_at: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    col.countDocuments(filter),
  ])
  return { rows: docs.map((d) => toRow(d as RagSourceDoc)), total, page, pageSize }
}

export interface KnowledgeStats {
  sources: number
  chunks: number
  embedded_chunks: number
  by_type: { type: KnowledgeSourceType; sources: number; chunks: number; ready: number; failed: number; queued: number }[]
  by_status: Record<string, number>
  models: string[]
  embedding_available: boolean
  vector_backend: 'atlas' | 'in_process'
  searches_7d: number
}

export async function knowledgeStats(caller: AgentCaller, tenantParam?: string | null): Promise<KnowledgeStats> {
  const [sources, chunks] = await Promise.all([ragSources(), ragChunks()])
  // CORE-025: a superadmin's organisation filter narrows the counters like the source list.
  const scope = sourceScopeFilter(caller, tenantParam)
  const chunkScope: { tenant_id?: string | null } = 'tenant_id' in scope ? { tenant_id: scope.tenant_id as string | null } : {}
  const [byType, byStatus, chunkCount, embedded, models, atlasOk] = await Promise.all([
    sources.aggregate<{ _id: KnowledgeSourceType; sources: number; chunks: number; ready: number; failed: number; queued: number }>([
      { $match: scope },
      { $group: {
        _id: '$type', sources: { $sum: 1 }, chunks: { $sum: '$chunk_count' },
        ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        queued: { $sum: { $cond: [{ $in: ['$status', ['queued', 'indexing']] }, 1, 0] } },
      } },
    ]).toArray(),
    sources.aggregate<{ _id: string; n: number }>([{ $match: scope }, { $group: { _id: '$status', n: { $sum: 1 } } }]).toArray(),
    chunks.countDocuments(chunkScope),
    chunks.countDocuments({ ...chunkScope, embedding_model: { $type: 'string' } }),
    availableEmbedModels(),
    caller.role === 'superadmin' ? atlasVectorAvailable() : Promise.resolve(false),
  ])
  let searches = 0
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    searches = await db.collection('rag_search_log').countDocuments({ ...chunkScope, at: { $gte: since } })
  } catch { /* optional */ }
  const order = new Map(KNOWLEDGE_SOURCE_TYPES.map((t, i) => [t, i]))
  return {
    sources: byType.reduce((n, r) => n + r.sources, 0),
    chunks: chunkCount,
    embedded_chunks: embedded,
    by_type: byType.map((r) => ({ type: r._id, sources: r.sources, chunks: r.chunks, ready: r.ready, failed: r.failed, queued: r.queued }))
      .sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99)),
    by_status: Object.fromEntries(byStatus.map((r) => [r._id, r.n])),
    models,
    embedding_available: models.length > 0,
    vector_backend: atlasOk ? 'atlas' : 'in_process',
    searches_7d: searches,
  }
}

/** Usage log for coverage stats (no query text stored — it may contain PII). */
export async function logSearch(caller: AgentCaller, hits: number, source: 'admin' | 'agent'): Promise<void> {
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    await db.collection('rag_search_log').insertOne({
      user_id: caller.userId, tenant_id: caller.tenantId, role: caller.role, hits, source, at: new Date().toISOString(),
    })
  } catch { /* best effort */ }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

async function scopedSource(caller: AgentCaller, id: string): Promise<RagSourceDoc> {
  const col = await ragSources()
  const doc = await col.findOne({ id })
  if (!doc) throw new KnowledgeError('Source not found', 404)
  if (caller.role === 'tenant_admin' && doc.tenant_id !== caller.tenantId) throw new KnowledgeError('Source not found', 404)
  return doc
}

export async function reindexOne(caller: AgentCaller, id: string): Promise<{ chunks: number }> {
  const doc = await scopedSource(caller, id)
  if (caller.role === 'tenant_admin' && !TENANT_TYPES.includes(doc.type)) throw new KnowledgeError('Not allowed', 403)
  return indexSource(doc.type, doc.source_id, { force: true })
}

export async function reindexScope(caller: AgentCaller, body: { types?: unknown; force?: unknown; tenant?: unknown }) {
  const types = Array.isArray(body.types) ? body.types.filter(isKnowledgeSourceType) : undefined
  const tenantId = caller.role === 'tenant_admin'
    ? caller.tenantId
    : typeof body.tenant === 'string' && TENANT_ID_RE.test(body.tenant) ? body.tenant : null
  return sweepKnowledge({ tenantId, types, force: body.force === true })
}

export async function deleteSource(caller: AgentCaller, id: string): Promise<void> {
  const doc = await scopedSource(caller, id)
  if (doc.type !== 'upload') {
    throw new KnowledgeError('Only uploaded documents can be deleted here. Other sources follow the data they come from.', 400)
  }
  const uploads = await ragUploads()
  await uploads.deleteOne({ id: doc.source_id, ...(caller.role === 'tenant_admin' ? { tenant_id: caller.tenantId } : {}) })
  await removeSource('upload', doc.source_id)
}

/** Virus scan via the backend ClamAV (same as /api/upload). Fail closed for admin uploads. */
async function virusScan(bytes: Buffer, filename: string): Promise<void> {
  try {
    await Promise.race([
      backendPost('/internal/security/scan', { file_base64: bytes.toString('base64'), filename }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('scan timeout')), 30_000)),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/returned (400|422)\b/.test(msg)) throw new KnowledgeError('The security scanner rejected this file.', 400)
    console.error('[rag/upload] scanner unavailable:', msg.slice(0, 200))
    throw new KnowledgeError('The security scanner is offline right now. Try again in a few minutes.', 503)
  }
}

function safeName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || 'file'
  return base.replace(/[\u0000-\u001f"<>|:*?]/g, '_').slice(0, 200) || 'file'
}

export async function uploadDocument(caller: AgentCaller, input: {
  fileName: string; bytes: Uint8Array; title?: unknown; kind?: unknown; tags?: unknown; tenant?: unknown
}): Promise<{ id: string; source_id: string; chunks: number; status: string; prompt_flags: string[] }> {
  const name = safeName(input.fileName)
  if (input.bytes.byteLength === 0) throw new KnowledgeError('The file is empty.')
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new KnowledgeError(`Files can be up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
  const type = detectUploadType(name, input.bytes)
  if (!type) throw new KnowledgeError('Upload a PDF, DOCX, TXT or Markdown file.')
  const buf = Buffer.from(input.bytes)
  await virusScan(buf, name)

  let text: string
  try {
    text = await extractUploadText(type, input.bytes)
  } catch (e) {
    console.error('[rag/upload] extraction failed:', (e as Error).message)
    throw new KnowledgeError("We couldn't read text from this file. If it's a scanned PDF, upload a text version.")
  }
  if (text.trim().length < 20) throw new KnowledgeError("We couldn't find any text in this file. If it's a scanned PDF, upload a text version.")
  // Uploaded text is untrusted data: flag (never block) injection attempts.
  const scan = scanPrompt(text)

  const tenantId = caller.role === 'tenant_admin'
    ? caller.tenantId
    : typeof input.tenant === 'string' && TENANT_ID_RE.test(input.tenant) ? input.tenant : null
  const kind: UploadKind = (UPLOAD_KINDS as readonly string[]).includes(String(input.kind)) ? (input.kind as UploadKind) : 'other'
  const title = (typeof input.title === 'string' ? input.title.trim() : '').slice(0, 200) || name.replace(/\.[^.]+$/, '')
  const now = new Date().toISOString()
  const doc: RagUploadDoc = {
    id: randomUUID(),
    tenant_id: tenantId,
    title,
    kind,
    tags: parseTags(input.tags),
    file_name: name,
    mime: type,
    size: input.bytes.byteLength,
    text,
    scan_status: 'clean',
    prompt_flags: scan.reasons.slice(0, 5),
    uploaded_by: caller.userId,
    created_at: now,
    updated_at: now,
  }
  await (await ragUploads()).insertOne(doc)
  try {
    const { chunks } = await indexSource('upload', doc.id, { force: true })
    return { id: `upload:${doc.id}`, source_id: doc.id, chunks, status: 'ready', prompt_flags: doc.prompt_flags }
  } catch (e) {
    console.error('[rag/upload] indexing failed, queued for retry:', (e as Error).message)
    await enqueueKnowledge({ type: 'upload', id: doc.id, tenantId })
    return { id: `upload:${doc.id}`, source_id: doc.id, chunks: 0, status: 'queued', prompt_flags: doc.prompt_flags }
  }
}
