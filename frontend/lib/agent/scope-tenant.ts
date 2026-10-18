/**
 * Superadmin tenant picker: which organisation a copilot conversation acts in.
 *
 * Only a superadmin may choose ("Whole platform" = null, or one tenant id that
 * exists in `tenants`). A tenant admin is always scoped to their own session
 * tenant; sending any other tenant is forbidden. The chosen tenant is stored
 * on the conversation and becomes `AgentCaller.tenantId` for tools and
 * knowledge search — store ownership keeps using the session caller.
 */
import type { AgentCaller } from '@/lib/agent/contract'

export const PLATFORM_SCOPE = 'platform'
const TENANT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/

export type ScopeRequest =
  | { kind: 'keep' } // not sent: use what the conversation has (or platform for new)
  | { kind: 'set'; tenantId: string | null }
  | { kind: 'error'; status: 400 | 403; error: string }

/** Pure: interpret the request body's `tenantId` for this caller. */
export function parseScopeRequest(caller: AgentCaller, raw: unknown): ScopeRequest {
  if (raw === undefined) return { kind: 'keep' }
  const v = raw === null ? '' : typeof raw === 'string' ? raw.trim() : undefined
  if (v === undefined) return { kind: 'error', status: 400, error: 'tenantId must be a string.' }
  if (caller.role !== 'superadmin') {
    // Tenant admins cannot pick; their own tenant (or nothing) is a no-op.
    if (!v || v === caller.tenantId) return { kind: 'keep' }
    return { kind: 'error', status: 403, error: 'Only platform admins can choose an organisation.' }
  }
  if (!v || v === PLATFORM_SCOPE) return { kind: 'set', tenantId: null }
  if (!TENANT_ID_RE.test(v)) return { kind: 'error', status: 400, error: 'Unknown organisation.' }
  return { kind: 'set', tenantId: v }
}

/** The caller tools and knowledge search run as for this conversation. */
export function scopedCaller(caller: AgentCaller, scopeTenantId: string | null | undefined): AgentCaller {
  if (caller.role !== 'superadmin') return caller
  return { ...caller, tenantId: scopeTenantId ?? null }
}

/** Does this tenant exist? (superadmin picker validation) */
export async function tenantExists(tenantId: string): Promise<boolean> {
  const { tenants } = await import('@/lib/db/admin')
  const t = await (await tenants()).findOne({ id: tenantId }, { projection: { _id: 0, id: 1 } })
  return !!t
}

export interface TenantOption {
  id: string
  name: string
  is_active: boolean
}

export async function listTenantOptions(limit = 500): Promise<TenantOption[]> {
  const { tenants } = await import('@/lib/db/admin')
  const rows = await (await tenants())
    .find({}, { projection: { _id: 0, id: 1, name: 1, is_active: 1 } })
    .sort({ name: 1 })
    .limit(limit)
    .toArray()
  return rows.map((r) => ({ id: String(r.id), name: String(r.name || r.id), is_active: r.is_active !== false }))
}
