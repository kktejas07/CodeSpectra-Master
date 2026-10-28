/**
 * Who may use the agent and each tool. Pure (no DB) — the session user comes
 * from lib/route-auth (getAPIUser / requireAdmin), never from request bodies
 * or model output.
 */
import { ToolPermissionError, type AgentCaller, type AgentTool } from '@/lib/agent/contract'

export interface SessionUserLike {
  id: string
  role: string
  tenantId?: string | null
  name?: string
  email?: string
}

/** Session user → agent caller, or null when the user may not use the agent. */
export function callerFromUser(u: SessionUserLike | null | undefined): AgentCaller | null {
  if (!u?.id) return null
  if (u.role === 'superadmin') {
    return { userId: u.id, role: 'superadmin', tenantId: u.tenantId ?? null, name: u.name, email: u.email }
  }
  if (u.role === 'tenant_admin' && u.tenantId) {
    return { userId: u.id, role: 'tenant_admin', tenantId: u.tenantId, name: u.name, email: u.email }
  }
  return null
}

/** Throws ToolPermissionError when `caller` may not use `tool`. */
export function assertToolAccess(tool: Pick<AgentTool, 'name' | 'roles'>, caller: AgentCaller): void {
  if (!tool.roles.includes(caller.role)) {
    throw new ToolPermissionError(`Your role can't use ${tool.name}.`)
  }
  if (caller.role === 'tenant_admin' && !caller.tenantId) {
    throw new ToolPermissionError('Your account is not linked to an organisation.')
  }
}

export function canUseTool(tool: Pick<AgentTool, 'name' | 'roles'>, caller: AgentCaller): boolean {
  try {
    assertToolAccess(tool, caller)
    return true
  } catch {
    return false
  }
}
