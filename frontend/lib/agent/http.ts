/** Shared auth gate for /api/admin/agent/** (session only, never request bodies). */
import 'server-only'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { callerFromUser } from '@/lib/agent/permissions'
import type { AgentCaller } from '@/lib/agent/contract'

export async function requireAgentCaller(): Promise<{ caller: AgentCaller } | { response: NextResponse }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) }
  const caller = callerFromUser(auth.user)
  if (!caller) return { response: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }) }
  return { caller }
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json()
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Admin audit for agent actions (lib/admin-audit, never throws). */
export async function auditAgent(
  actor: { id: string },
  action: string,
  resource: string,
  detail: string,
  severity: 'info' | 'warning' | 'critical',
): Promise<void> {
  const { auditAdmin } = await import('@/lib/admin-audit')
  await auditAdmin(actor, action, 'agent_action', resource, detail, severity)
}
