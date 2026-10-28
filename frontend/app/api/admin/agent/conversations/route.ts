/** GET /api/admin/agent/conversations — the caller's copilot conversations (newest first). */
import { NextResponse } from 'next/server'
import { requireAgentCaller } from '@/lib/agent/http'
import { listConversations } from '@/lib/agent/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  try {
    const rows = await listConversations(gate.caller, 100)
    return NextResponse.json({
      conversations: rows.map((c) => ({ id: c.id, title: c.title, created_at: c.created_at, updated_at: c.updated_at, ...(gate.caller.role === 'superadmin' ? { tenant_id: c.scope_tenant_id ?? null } : {}) })),
    })
  } catch (e) {
    console.error('[agent/conversations] list failed:', e)
    return NextResponse.json({ error: 'Could not load conversations' }, { status: 500 })
  }
}
