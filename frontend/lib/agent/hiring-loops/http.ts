/** Shared gate for /api/admin/hiring-agents/** (server only): admin session + the organisation it acts in. */
import 'server-only'
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import type { AgentCaller } from '@/lib/agent/contract'

/**
 * Tenant admins act in their own organisation; a superadmin names one with
 * ?tenant=<id> (checked to exist). Never from a request body.
 */
export async function hiringAgentsGate(req: Request): Promise<{ caller: AgentCaller; tenantId: string } | { response: NextResponse }> {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate
  const caller = gate.caller
  if (caller.role === 'tenant_admin') return { caller, tenantId: caller.tenantId! }
  const t = new URL(req.url).searchParams.get('tenant') || ''
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(t)) return { response: NextResponse.json({ error: 'Choose an organisation.', code: 'licence_org_required' }, { status: 400 }) }
  const { getMongoDb } = await import('@/lib/mongodb')
  const exists = await (await getMongoDb()).collection('tenants').findOne({ id: t }, { projection: { _id: 1 } })
  if (!exists) return { response: NextResponse.json({ error: 'Organisation not found', code: 'talent_org_not_found' }, { status: 404 }) }
  return { caller: { ...caller, tenantId: t }, tenantId: t }
}
