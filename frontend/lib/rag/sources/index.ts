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

export const SWEEP_LIMIT = 5000

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
    default: return []
  }
}
