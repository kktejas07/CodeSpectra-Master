/**
 * Knowledge ACL — the Mongo filter every search runs INSIDE its query (pure).
 *
 * Rules (lib/agent/contract.ts):
 *  - superadmin: everything; with `tenantId` → that tenant + platform-wide rows.
 *  - tenant_admin (must have a tenantId): their tenant's rows, plus platform rows
 *    whose visibility is 'public'. Never another tenant, never 'platform_admin'
 *    rows, never platform-wide staff-only rows (those are stored as platform_admin).
 *  - anything else: matches nothing.
 *
 * Filters use `tenant_key` (tenant id or '_platform') rather than null checks so
 * the same filter works in $match, $text and Atlas $vectorSearch.
 */
import type { AgentCaller, KnowledgeSourceType } from '@/lib/agent/contract'
import { KNOWLEDGE_SOURCE_TYPES, PLATFORM_TENANT_KEY, STAFF_ONLY_TYPES, tenantKey } from './types'

export type AclFilter = Record<string, unknown>

/** A filter no document can satisfy. */
export const MATCH_NOTHING: AclFilter = { tenant_key: { $in: [] } }

const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/

export function knowledgeAclFilter(
  caller: AgentCaller | null | undefined,
  opts: { types?: readonly KnowledgeSourceType[]; tenantId?: string | null } = {},
): AclFilter {
  if (!caller || !caller.userId) return MATCH_NOTHING
  const types = (opts.types ?? []).filter((t) => (KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(t))
  const typeClause: AclFilter = types.length ? { source_type: { $in: [...new Set(types)] } } : {}

  if (caller.role === 'superadmin') {
    const t = typeof opts.tenantId === 'string' ? opts.tenantId.trim() : ''
    if (t && !TENANT_ID_RE.test(t)) return MATCH_NOTHING
    return { ...typeClause, ...(t ? { tenant_key: { $in: [PLATFORM_TENANT_KEY, t] } } : {}) }
  }

  if (caller.role === 'tenant_admin') {
    const tid = typeof caller.tenantId === 'string' ? caller.tenantId.trim() : ''
    if (!tid || !TENANT_ID_RE.test(tid)) return MATCH_NOTHING
    // Platform rows a tenant admin may read: public, and never staff-only types.
    const publicTypes = (types.length ? types : KNOWLEDGE_SOURCE_TYPES).filter((t) => !STAFF_ONLY_TYPES.has(t))
    return {
      $or: [
        { tenant_key: tenantKey(tid), visibility: { $in: ['tenant', 'public'] }, ...typeClause },
        { tenant_key: PLATFORM_TENANT_KEY, visibility: 'public', source_type: { $in: publicTypes } },
      ],
    }
  }
  return MATCH_NOTHING
}

/** AND filters together, dropping empty ones (Atlas $vectorSearch rejects `{}` clauses). */
export function andFilters(...filters: AclFilter[]): AclFilter {
  const parts = filters.filter((f) => f && Object.keys(f).length > 0)
  if (parts.length === 0) return {}
  return parts.length === 1 ? parts[0] : { $and: parts }
}

/** Same rule applied to one stored row (defence in depth after the query). */
export function canSeeChunk(
  caller: AgentCaller | null | undefined,
  row: { tenant_key?: string; tenant_id?: string | null; visibility?: string; source_type?: string },
  tenantId?: string | null,
): boolean {
  if (!caller) return false
  const key = row.tenant_key ?? tenantKey(row.tenant_id ?? null)
  if (caller.role === 'superadmin') {
    return !tenantId || key === PLATFORM_TENANT_KEY || key === tenantId
  }
  if (caller.role !== 'tenant_admin' || !caller.tenantId) return false
  if (key === caller.tenantId) return row.visibility === 'tenant' || row.visibility === 'public'
  return key === PLATFORM_TENANT_KEY && row.visibility === 'public'
    && !STAFF_ONLY_TYPES.has(row.source_type as KnowledgeSourceType)
}

/**
 * Normalise extractor output so a staff-only type can never be stored as public,
 * and a platform-wide staff-only row is superadmin-only.
 */
export function effectiveVisibility(
  type: KnowledgeSourceType,
  tenantId: string | null,
  visibility: 'public' | 'platform_admin' | 'tenant',
): 'public' | 'platform_admin' | 'tenant' {
  if (STAFF_ONLY_TYPES.has(type)) return tenantId ? 'tenant' : 'platform_admin'
  if (visibility === 'tenant' && !tenantId) return 'platform_admin'
  return visibility
}
