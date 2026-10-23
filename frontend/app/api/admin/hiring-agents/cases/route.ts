/**
 * POST /api/admin/hiring-agents/cases[?tenant=] { id } — draft the hold /
 * release-hold proposal suggested for one integrity case, owned by the signed-in
 * admin (confirmed through /api/admin/agent/actions/[id]/confirm). The
 * suggestion comes from the stored case, never from the request.
 */
import { NextResponse } from 'next/server'
import { readJson } from '@/lib/agent/http'
import { hiringAgentsGate } from '@/lib/agent/hiring-loops/http'
import { ToolInputError, ToolPermissionError, type ProposedAction } from '@/lib/agent/contract'
import { newId } from '@/lib/db/ids'
import { limitRequest } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const gate = await hiringAgentsGate(req)
  if ('response' in gate) return gate.response
  const limited = await limitRequest(req, 'hiring-agents-case', gate.caller.userId, 60, 60 * 60_000)
  if (limited) return limited
  const body = await readJson(req)
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id.startsWith(`${gate.tenantId}:`) || id.length > 300) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  const { casesCol } = await import('@/lib/agent/hiring-loops/store')
  const col = await casesCol()
  const c = await col.findOne({ _id: id, tenant_id: gate.tenantId })
  if (!c || c.target_kind !== 'exam' || c.recommendation === 'none') return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const { getTool } = await import('@/lib/agent/tools')
  const tool = getTool('set_integrity_hold')!
  const { createConversation, saveAction } = await import('@/lib/agent/store')
  const conv = await createConversation(gate.caller, `Integrity review · ${c.target_title}`.slice(0, 120), gate.tenantId)
  const ctx = { caller: gate.caller, conversationId: conv.id }
  try {
    const args = (await tool.parse({ test_id: c.target_id, user_ids: [c.user_id], hold: c.recommendation === 'hold', note: c.summary.slice(0, 500) }, ctx)) as Record<string, unknown>
    const p = await tool.propose!(args, ctx)
    const { PROPOSAL_TTL_MS } = await import('@/lib/agent/run')
    const now = Date.now()
    const action: ProposedAction = {
      id: newId(), conversationId: conv.id, tool: tool.name, risk: tool.risk === 'none' ? 'update' : tool.risk, title: p.title.slice(0, 300),
      preview: { ...p.preview, drafted_by: 'hiring-agent-integrity' }, args, status: 'pending', created_by: gate.caller.userId, tenant_id: gate.tenantId,
      created_at: new Date(now).toISOString(), expires_at: new Date(now + PROPOSAL_TTL_MS).toISOString(),
    }
    await saveAction(action)
    await col.updateOne({ _id: id }, { $set: { action_id: action.id } })
    return NextResponse.json({ action })
  } catch (e) {
    if (e instanceof ToolInputError || e instanceof ToolPermissionError) return NextResponse.json({ error: e.message, code: 'invalid_request' }, { status: 400 })
    throw e
  }
}
