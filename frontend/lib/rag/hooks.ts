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

/** Learn hub post published / edited / unpublished (the loader drops non-published posts). */
export function knowledgeOnLearnPost(postId: unknown): void {
  if (typeof postId !== 'string' || !postId) return
  void enqueueKnowledge({ type: 'doc', id: `learn:${postId}`, tenantId: null })
}
