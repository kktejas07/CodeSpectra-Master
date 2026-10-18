/**
 * GET    /api/admin/agent/conversations/[id] — messages (UI shape) + proposals
 * PATCH  /api/admin/agent/conversations/[id] — rename { title }
 * DELETE /api/admin/agent/conversations/[id] — delete (pending proposals are cancelled)
 * Owner + tenant scoped.
 */
import { NextResponse } from 'next/server'
import { requireAgentCaller, readJson } from '@/lib/agent/http'
import {
  deleteConversation,
  expireStaleActions,
  getConversation,
  listActions,
  loadMessages,
  renameConversation,
} from '@/lib/agent/store'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { id } = await params
  const conv = await getConversation(gate.caller, id)
  if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  await expireStaleActions().catch(() => 0)
  const [docs, actions] = await Promise.all([loadMessages(gate.caller, id), listActions(gate.caller, id)])
  const messages = docs
    .filter((d) => !d.hidden)
    .map((d) => ({
      id: d.id,
      role: d.role,
      // Tool output stays server-side; the UI shows the summary.
      content: d.role === 'tool' ? '' : d.content,
      ...(d.tool_calls ? { tool_calls: d.tool_calls.map((c) => ({ id: c.id, tool: c.tool, args: c.args })) } : {}),
      ...(d.tool_call_id ? { tool_call_id: d.tool_call_id, tool_name: d.tool_name } : {}),
      ...(d.role === 'tool' ? { ok: d.ok !== false, summary: d.summary || '', citations: d.citations ?? [], action_id: d.action_id } : {}),
      created_at: d.created_at,
    }))
  return NextResponse.json({
    conversation: { id: conv.id, title: conv.title, created_at: conv.created_at, updated_at: conv.updated_at, last_model: conv.last_model ?? null },
    messages,
    actions,
  })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { id } = await params
  const body = await readJson(req)
  const title = typeof body?.title === 'string' ? body.title : ''
  if (!title.trim()) return NextResponse.json({ error: 'Title required' }, { status: 400 })
  const ok = await renameConversation(gate.caller, id, title)
  if (!ok) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const gate = await requireAgentCaller()
  if ('response' in gate) return gate.response
  const { id } = await params
  const ok = await deleteConversation(gate.caller, id)
  if (!ok) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
