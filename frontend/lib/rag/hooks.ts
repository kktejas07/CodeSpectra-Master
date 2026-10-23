/**
 * One-line knowledge hooks for write paths. They only enqueue (one upsert);
 * the scheduler tick indexes. A deleted source is removed when its turn comes
 * (its loader returns null). Fire-and-forget: never throws, never blocks.
 */
import { enqueueKnowledge } from './ingest'

const tid = (t: unknown): string | null => (typeof t === 'string' && t ? t : null)

export function knowledgeOnTestChange(examId: unknown, tenantId?: unknown): void {
  if (typeof examId !== 'string' || !examId) return
  void enqueueKnowledge([
    { type: 'test', id: examId, tenantId: tid(tenantId) },
    { type: 'test_result_summary', id: examId, tenantId: tid(tenantId) },
  ])
}

export function knowledgeOnSubmission(examId: unknown, userId: unknown, tenantId?: unknown): void {
  if (typeof examId !== 'string' || !examId || typeof userId !== 'string' || !userId) return
  const t = tid(tenantId)
  void enqueueKnowledge([
    { type: 'attempt_summary', id: `${examId}:${userId}`, tenantId: t },
    { type: 'test_result_summary', id: examId, tenantId: t },
    { type: 'resume', id: `${t ?? '_platform'}:${userId}`, tenantId: t },
  ])
}

export function knowledgeOnEventChange(type: 'hackathon' | 'codeathon', id: unknown, tenantId?: unknown): void {
  if (typeof id !== 'string' || !id) return
  void enqueueKnowledge({ type, id, tenantId: tid(tenantId) })
}

/** Marketplace product created / edited / moderated / removed (loader keeps published + approved seller only). */
export function knowledgeOnMarketplaceProduct(productIds: unknown): void {
  const ids = (Array.isArray(productIds) ? productIds : [productIds]).filter((x): x is string => typeof x === 'string' && !!x)
  if (ids.length) void enqueueKnowledge(ids.map((id) => ({ type: 'marketplace_product' as const, id, tenantId: null })))
}

/** Events-feed event inserted / refreshed / edited / hidden / archived (loader keeps published only). */
export function knowledgeOnExternalEvent(eventIds: unknown): void {
  const ids = (Array.isArray(eventIds) ? eventIds : [eventIds]).filter((x): x is string => typeof x === 'string' && !!x)
  if (ids.length) void enqueueKnowledge(ids.map((id) => ({ type: 'external_event' as const, id, tenantId: null })))
}

/** Tech news post published / edited / unpublished (the loader keeps published 'signals' posts only). */
export function knowledgeOnNewsPost(postIds: unknown): void {
  const ids = (Array.isArray(postIds) ? postIds : [postIds]).filter((x): x is string => typeof x === 'string' && !!x)
  if (ids.length) void enqueueKnowledge(ids.map((id) => ({ type: 'news' as const, id, tenantId: null })))
}

/** Daily digest published / re-run / unpublished (lib/digest/service). */
export function knowledgeOnDigest(digestId: unknown): void {
  if (typeof digestId !== 'string' || !/^dg_\d{4}-\d{2}-\d{2}$/.test(digestId)) return
  void enqueueKnowledge({ type: 'digest', id: digestId, tenantId: null })
}

/** Learn hub post published / edited / unpublished (the loader drops non-published posts). */
export function knowledgeOnLearnPost(postId: unknown): void {
  if (typeof postId !== 'string' || !postId) return
  void enqueueKnowledge({ type: 'doc', id: `learn:${postId}`, tenantId: null })
}

/** Library content changed (problem / question-bank item / course): reindex within a minute, not at the nightly sweep (RAG-003). */
export function knowledgeOnLibraryChange(type: 'problem' | 'question' | 'course', ids: unknown): void {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((x): x is string => typeof x === 'string' && !!x)
  if (list.length) void enqueueKnowledge(list.map((id) => ({ type, id, tenantId: null })))
}

/** Hiring pipeline job created / edited / closed / deleted (RAG-001). */
export function knowledgeOnAtsJob(jobId: unknown, tenantId?: unknown): void {
  if (typeof jobId !== 'string' || !jobId) return
  void enqueueKnowledge({ type: 'ats_job', id: jobId, tenantId: tid(tenantId) })
}

/** Application created / moved / rejected / withdrawn (RAG-001). */
export function knowledgeOnAtsApplication(appIds: unknown, tenantId?: unknown): void {
  const list = (Array.isArray(appIds) ? appIds : [appIds]).filter((x): x is string => typeof x === 'string' && !!x)
  if (list.length) void enqueueKnowledge(list.map((id) => ({ type: 'ats_application' as const, id, tenantId: tid(tenantId) })))
}

/** Account deleted: drop the person's résumé / attempt sources everywhere (RAG-004). */
export function knowledgeOnUserDeleted(userId: unknown): void {
  if (typeof userId !== 'string' || !userId) return
  void import('./ingest').then(({ purgeUserKnowledge }) => purgeUserKnowledge(userId)).catch((e) => console.error('[rag] purge on account deletion failed:', e))
}
