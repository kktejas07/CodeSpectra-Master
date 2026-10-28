/**
 * Public knowledge scope (pure): what anonymous visitors and learners may
 * search through "Ask about events & news" — the public catalogue only.
 *
 *   daily digests · tech news · events feed · Learn posts + docs / FAQ / legal (`doc`)
 *   · platform hackathons, codeathons and hosted contests (published + public only)
 *
 * The filter is built here from constants — nothing from the request can
 * widen it: requested types are intersected with PUBLIC_ASK_TYPES, and every
 * row must be platform-wide (`_platform`) AND visibility 'public'. Tenant
 * tests, uploads, résumés, ATS data and admin-only docs are never matched.
 */
import type { KnowledgeSourceType } from '@/lib/agent/contract'
import { PLATFORM_TENANT_KEY, STAFF_ONLY_TYPES } from './types'

// RAG-022: platform hackathons / codeathons / hosted contests too — still only rows that are platform-wide AND
// visibility 'public' (published, non-draft, public listing), so organisation and draft events never match.
export const PUBLIC_ASK_TYPES: readonly KnowledgeSourceType[] = ['digest', 'news', 'external_event', 'doc', 'hackathon', 'codeathon', 'contest']

/** Requested types ∩ public types (empty / unknown → all public types). Pure. */
export function publicTypes(requested?: readonly unknown[] | null): KnowledgeSourceType[] {
  const want = (requested || []).filter((t): t is KnowledgeSourceType => typeof t === 'string' && (PUBLIC_ASK_TYPES as readonly string[]).includes(t))
  return [...new Set(want.length ? want : PUBLIC_ASK_TYPES)].filter((t) => !STAFF_ONLY_TYPES.has(t))
}

/** The Mongo filter every public query runs inside (vector, keyword and text fetch). Pure. */
export function publicAclFilter(requested?: readonly unknown[] | null): Record<string, unknown> {
  return { tenant_key: PLATFORM_TENANT_KEY, visibility: 'public', source_type: { $in: publicTypes(requested) } }
}

/** Same rule on one stored row (defence in depth after the query). Pure. */
export function canSeePublicChunk(row: { tenant_key?: string; tenant_id?: string | null; visibility?: string; source_type?: string }): boolean {
  const key = row.tenant_key ?? (row.tenant_id ? row.tenant_id : PLATFORM_TENANT_KEY)
  return key === PLATFORM_TENANT_KEY && row.tenant_id == null && row.visibility === 'public' && (PUBLIC_ASK_TYPES as readonly string[]).includes(String(row.source_type))
}
