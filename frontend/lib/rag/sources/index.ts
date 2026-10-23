/**
 * Source registry: load one source by (type, id), or list the ids of a type
 * (optionally only one organisation's) for sweeps.
 */
import type { Db } from 'mongodb'
import type { ExtractedSource, KnowledgeSourceType } from '../types'
import { listCourseIds, listProblemIds, listQuestionIds, loadCourse, loadProblem, loadQuestion } from './library'
import { listDocIds, loadDoc } from './docs'
import { listAttemptIds, listResultSummaryIds, listTestIds, loadAttempt, loadResultSummary, loadTest } from './assessments'
import { listEventIds, loadCodeathon, loadHackathon } from './events'
import { listUploadIds, loadUpload } from './uploads'
import { listResumeIds, loadResume } from './resumes'
import { listExternalEventIds, listMarketplaceProductIds, loadExternalEvent, loadMarketplaceProduct } from './content'
import { listAtsApplicationIds, listAtsJobIds, loadAtsApplication, loadAtsJob } from './ats'
import { listDigestIds, listNewsPostIds, loadDigest, loadNewsPost } from './digest'

/** Ids per list call for derived source types (RAG-005: plain collection types are paged instead). */
export const SWEEP_LIMIT = 50_000
/** Page size when paging through a collection's ids. */
export const SWEEP_PAGE = 5000

export async function loadSource(db: Db, type: KnowledgeSourceType, id: string): Promise<ExtractedSource | null> {
  switch (type) {
    case 'problem': return loadProblem(db, id)
    case 'question': return loadQuestion(db, id)
    case 'course': return loadCourse(db, id)
    case 'doc': return loadDoc(id)
    case 'test': return loadTest(db, id)
    case 'test_result_summary': return loadResultSummary(db, id)
    case 'attempt_summary': return loadAttempt(db, id)
    case 'hackathon': return loadHackathon(db, id)
    case 'codeathon': return loadCodeathon(db, id)
    case 'upload': return loadUpload(db, id)
    case 'resume': return loadResume(db, id)
    case 'marketplace_product': return loadMarketplaceProduct(db, id)
    case 'external_event': return loadExternalEvent(db, id)
    case 'ats_job': return loadAtsJob(db, id)
    case 'ats_application': return loadAtsApplication(db, id)
    case 'news': return loadNewsPost(db, id)
    case 'digest': return loadDigest(db, id)
    default: return null
  }
}

/**
 * Ids of a type. With `tenantId`, only that organisation's sources (platform
 * library types return [] — tenants can't reindex those).
 */
export async function listSourceIds(db: Db, type: KnowledgeSourceType, tenantId?: string | null, limit = SWEEP_LIMIT): Promise<string[]> {
  switch (type) {
    case 'problem': return tenantId ? [] : listProblemIds(db, limit)
    case 'question': return tenantId ? [] : listQuestionIds(db, limit)
    case 'course': return tenantId ? [] : listCourseIds(db, limit)
    case 'doc': return tenantId ? [] : listDocIds()
    case 'test': return listTestIds(db, limit, tenantId)
    case 'test_result_summary': return listResultSummaryIds(db, limit, tenantId)
    case 'attempt_summary': return listAttemptIds(db, limit, tenantId)
    case 'hackathon': return listEventIds(db, 'hackathons', limit, tenantId)
    case 'codeathon': return listEventIds(db, 'codeathons', limit, tenantId)
    case 'upload': return listUploadIds(db, limit, tenantId)
    case 'resume': return listResumeIds(db, limit, tenantId)
    case 'marketplace_product': return tenantId ? [] : listMarketplaceProductIds(db, limit)
    case 'external_event': return tenantId ? [] : listExternalEventIds(db, limit)
    case 'ats_job': return listAtsJobIds(db, limit, tenantId)
    case 'ats_application': return listAtsApplicationIds(db, limit, tenantId)
    case 'news': return tenantId ? [] : listNewsPostIds(db, limit)
    case 'digest': return tenantId ? [] : listDigestIds(db, limit)
    default: return []
  }
}

/**
 * Types whose ids are one collection + filter: swept page by page in id order
 * (RAG-005 — no per-type ceiling). Platform library types are not tenant-owned.
 */
const PAGED: Partial<Record<KnowledgeSourceType, { collection: string; filter: Record<string, unknown>; tenantOwned: boolean }>> = {
  problem: { collection: 'problems', filter: { is_published: { $ne: false }, id: { $type: 'string' } }, tenantOwned: false },
  question: { collection: 'question_bank', filter: { is_active: { $ne: false }, review_status: { $ne: 'draft' } }, tenantOwned: false },
  course: { collection: 'courses', filter: {}, tenantOwned: false },
  test: { collection: 'exams', filter: {}, tenantOwned: true },
  hackathon: { collection: 'hackathons', filter: {}, tenantOwned: true },
  codeathon: { collection: 'codeathons', filter: {}, tenantOwned: true },
  upload: { collection: 'rag_uploads', filter: {}, tenantOwned: true },
  external_event: { collection: 'events_feed', filter: { status: 'published' }, tenantOwned: false },
  ats_job: { collection: 'ats_jobs', filter: {}, tenantOwned: true },
  ats_application: { collection: 'ats_applications', filter: { status: { $ne: 'withdrawn' } }, tenantOwned: true },
  news: { collection: 'blog_posts', filter: { status: 'published', tags: 'signals', id: { $type: 'string' } }, tenantOwned: false },
  digest: { collection: 'daily_digests', filter: { status: 'published' }, tenantOwned: false },
}

/** Every id of a type, in pages (paged types) or one list (derived types). */
export async function* iterateSourceIds(db: Db, type: KnowledgeSourceType, tenantId?: string | null, pageSize = SWEEP_PAGE): AsyncGenerator<string[]> {
  const spec = PAGED[type]
  if (!spec) {
    // Derived types (result summaries, attempts, résumés, docs, marketplace) — one bounded list.
    const ids = await listSourceIds(db, type, tenantId ?? null)
    for (let i = 0; i < ids.length; i += pageSize) yield ids.slice(i, i + pageSize)
    return
  }
  if (tenantId && !spec.tenantOwned) return
  let after: string | null = null
  for (;;) {
    const filter: Record<string, unknown> = { ...spec.filter, ...(tenantId ? { tenant_id: tenantId } : {}) }
    if (after !== null) filter.id = { ...((spec.filter.id as Record<string, unknown>) ?? {}), $gt: after }
    const rows = await db.collection(spec.collection).find(filter, { projection: { _id: 0, id: 1 } }).sort({ id: 1 }).limit(pageSize).toArray()
    const ids = rows.map((r) => (typeof r.id === 'string' ? r.id : '')).filter(Boolean)
    if (ids.length) yield ids
    if (rows.length < pageSize) return
    after = String(rows[rows.length - 1].id)
  }
}
