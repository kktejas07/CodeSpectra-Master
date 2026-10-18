/**
 * GET   /api/admin/agent/actions/[id] — one proposal (owner + tenant scoped)
 * PATCH /api/admin/agent/actions/[id] — edit before confirming: { args } is
 *       re-validated with the tool's parse() and propose() builds a fresh preview.
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller, readJson } from '@/lib/agent/http'
import { editAction } from '@/lib/agent/actions'
import { getAction } from '@/lib/agent/store'
import { getTool } from '@/lib/agent/tools'
import { limitRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { id } = await params
  const action = await getAction(gate.caller, id)
  if (!action) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  return NextResponse.json({ action })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'admin-agent-action', gate.caller.userId, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  const body = await readJson(req)
  if (!body || !('args' in body)) return NextResponse.json({ error: 'args required' }, { status: 400 })
  const r = await editAction(gate.caller, id, body.args, { getTool })
  if (!r.ok) return NextResponse.json({ error: r.error, action: r.action }, { status: r.status })
  return NextResponse.json({ action: r.action })
}
