/** POST /api/admin/agent/actions/[id]/cancel — discard a pending proposal. */
import { NextResponse } from 'next/server'
import { auditAgent, requireAgentCaller } from '@/lib/agent/http'
import { cancelAction } from '@/lib/agent/actions'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { id } = await params
  const r = await cancelAction(gate.caller, id, { audit: auditAgent })
  if (!r.ok) return NextResponse.json({ error: r.error, action: r.action }, { status: r.status })
  return NextResponse.json({ action: r.action })
}
