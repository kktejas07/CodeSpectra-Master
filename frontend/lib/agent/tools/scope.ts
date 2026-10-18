/**
 * Caller → service user, tenant scoping, and friendly errors for agent tools.
 * The caller always comes from the server session (the runtime builds it);
 * nothing here reads a tenant or user id from model output.
 */
import { ToolInputError, ToolPermissionError, type AgentCaller, type AgentRole, type AgentTool } from '@/lib/agent/contract'
import type { ServiceErr, ServiceResult, ServiceUser } from '@/lib/services/result'

export const ADMIN_ROLES: AgentRole[] = ['superadmin', 'tenant_admin']

/** Throws unless the caller may use this tool at all (role + tenant present). */
export function assertCaller(tool: Pick<AgentTool, 'name' | 'roles'>, caller: AgentCaller | null | undefined): AgentCaller {
  if (!caller || !caller.userId) throw new ToolPermissionError('You need to be signed in as an admin.')
  if (caller.role !== 'superadmin' && caller.role !== 'tenant_admin') throw new ToolPermissionError('Only admins can use the assistant.')
  if (!tool.roles.includes(caller.role)) throw new ToolPermissionError(`Your role can't use ${tool.name}.`)
  // Deny by default: a tenant admin without an organisation owns nothing.
  if (caller.role === 'tenant_admin' && !caller.tenantId) throw new ToolPermissionError('Your account is not linked to an organisation.')
  return caller
}

/** The acting user as lib/services/* expect it. */
export function serviceUser(caller: AgentCaller): ServiceUser {
  return {
    id: caller.userId,
    email: caller.email || '',
    role: caller.role,
    tenantId: caller.role === 'tenant_admin' ? caller.tenantId : caller.tenantId ?? null,
    ...(caller.name ? { name: caller.name } : {}),
  }
}

/**
 * Mongo filter for the caller's own records (field `tenant_id`).
 * Superadmin: everything, or the tenant they picked. Tenant admin: own tenant only.
 */
export function tenantFilter(caller: AgentCaller): Record<string, unknown> {
  if (caller.role === 'superadmin') return caller.tenantId ? { tenant_id: caller.tenantId } : {}
  return caller.tenantId ? { tenant_id: caller.tenantId } : { _id: null }
}

/** Same rule as lib/exam-access isTenantStaff, for a loaded record. */
export function canManage(caller: AgentCaller, doc: { tenant_id?: unknown } | null | undefined): boolean {
  if (!doc) return false
  if (caller.role === 'superadmin') return true
  return caller.role === 'tenant_admin' && !!caller.tenantId && doc.tenant_id === caller.tenantId
}

export function assertCanManage(caller: AgentCaller, doc: { tenant_id?: unknown } | null | undefined, what: string): void {
  if (!doc) throw new ToolPermissionError(`${what} not found. Check the id (use a list tool to find it).`)
  if (!canManage(caller, doc)) throw new ToolPermissionError(`That ${what.toLowerCase()} belongs to another organisation.`)
}

/** A service error as a message an admin can act on. */
export function friendlyServiceError(r: ServiceErr): string {
  const msg = r.error || ''
  if (r.status === 402) {
    // Plan limits already carry an upgrade hint; add the limit when known.
    const limit = typeof r.body?.limit === 'number' ? ` (limit ${r.body.limit}${typeof r.body?.plan === 'string' ? ` on the ${r.body.plan} plan` : ''})` : ''
    return `${msg.replace(/\.$/, '')}${limit}.`
  }
  if (r.status === 403) {
    if (/another tenant/i.test(msg)) return 'That belongs to another organisation.'
    if (msg === 'Forbidden') return "You don't have access to do that."
    return msg
  }
  if (r.status === 404) return /not found/i.test(msg) && msg.length > 12 ? msg : 'Not found. Check the id (use a list tool to find it).'
  if (r.status >= 500) return msg && r.status === 502 ? msg : 'Something went wrong on our side. Try again in a moment.'
  return msg || 'That did not work.'
}

/** Data on success; throws ToolPermissionError with a friendly message otherwise (propose/run paths). */
export function unwrap<T>(r: ServiceResult<T>): T {
  if (r.ok) return r.data
  const msg = friendlyServiceError(r)
  if (r.status === 400 || r.status === 409) throw new ToolInputError(msg)
  if (r.status >= 500) throw new Error(msg)
  throw new ToolPermissionError(msg)
}
