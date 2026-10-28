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
import { executionCaller } from '@/lib/agent/actions'
import { chargeMeteredWork, metered } from '@/lib/agent/service'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { id } = await params
  const action = await getAction(gate.caller, id)
  if (!action) return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  // AGT-005: the edit form is built from the tool's parameter schema; internal keys
  // (sealed AI draft, idempotency nonce) are never part of the editable view.
  const tool = getTool(action.tool)
  const editable = Object.fromEntries(Object.entries(action.args ?? {}).filter(([k]) => !k.startsWith('_')))
  return NextResponse.json({ action, schema: tool?.parameters ?? null, editable_args: editable })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'admin-agent-action', gate.caller.userId, 30, 60_000)
  if (limited) return limited
  const { id } = await params
  const body = await readJson(req)
  if (!body || !('args' in body)) return NextResponse.json({ error: 'args required' }, { status: 400 })
  // AGT-002: AI work an edit re-runs (only when the generation inputs changed) is metered and charged.
  const r = await editAction(gate.caller, id, body.args, { getTool, meter: metered })
  if (!r.ok) return NextResponse.json({ error: r.error, action: r.action }, { status: r.status })
  const credits = r.usage?.length
    ? await chargeMeteredWork(executionCaller(gate.caller, r.action), gate.caller.userId, r.action.conversationId, r.usage, 'edit')
    : 0
  return NextResponse.json({ action: r.action, credits })
}
