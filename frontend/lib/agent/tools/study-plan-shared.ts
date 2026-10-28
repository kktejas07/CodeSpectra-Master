/** Resolve a learner for the study-plan agent tools (by user id or e-mail); tenant admins: own organisation's users only. */
import type { AgentCaller } from '@/lib/agent/contract'
import { ToolInputError } from '@/lib/agent/contract'
import { getMongoDb } from '@/lib/mongodb'

export async function resolveLearner(caller: AgentCaller, ref: string): Promise<{ id: string; name: string | null }> {
  const s = ref.trim()
  const db = await getMongoDb()
  const q = s.includes('@') ? { email: s.toLowerCase() } : { $or: [{ id: s }, { _id: s as never }] }
  const u = await db.collection('user').findOne(q as never, { projection: { id: 1, _id: 1, name: 1, fullName: 1, tenantId: 1, organizationId: 1 } })
  if (!u) throw new ToolInputError('No learner found with that id or e-mail.')
  if (!learnerInScope(caller, u.tenantId ?? u.organizationId)) throw new ToolInputError('That learner is not in your organisation.')
  return { id: String(u.id || u._id), name: typeof u.fullName === 'string' ? u.fullName : typeof u.name === 'string' ? u.name : null }
}

/**
 * AGT-032: same rule as canManage() — an unscoped superadmin sees everyone; a superadmin scoped to one
 * organisation sees that organisation's learners plus individual (no-organisation) learners; tenant admins
 * see their own organisation only.
 */
export function learnerInScope(caller: Pick<AgentCaller, 'role' | 'tenantId'>, learnerTenant: unknown): boolean {
  const t = typeof learnerTenant === 'string' && learnerTenant ? learnerTenant : null
  if (caller.role === 'superadmin') return !caller.tenantId || t === null || t === caller.tenantId
  return !!caller.tenantId && t === caller.tenantId
}
