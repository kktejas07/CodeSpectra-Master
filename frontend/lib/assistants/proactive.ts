/**
 * Loop → copilot proposals (server only). A scheduled assistant (revenue, weekly
 * placement report) never acts by itself: it drafts write-tool proposals with
 * the tool's own parse() + propose() as the target admin and posts them into a
 * new copilot conversation of that admin. They review and confirm them in
 * Admin → AI copilot, through the normal confirm endpoint (re-validation,
 * re-authorisation, idempotency ledger, audit). Proposals expire in 24 h like
 * any other; the next run drafts what is still relevant.
 */
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { AgentCaller, ProposedAction } from '@/lib/agent/contract'
import { logger } from '@/lib/logger'

const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000

export interface ProactiveDraft {
  tool: string
  args: Record<string, unknown>
}

export interface PostedProposals {
  conversation_id: string | null
  action_ids: string[]
  failed: { tool: string; error: string }[]
}

/**
 * Create a conversation titled `title` for `caller`, write `intro` as the
 * assistant's message and draft each proposal. Nothing runs until confirmed.
 */
export async function postProposals(caller: AgentCaller, title: string, intro: string, drafts: readonly ProactiveDraft[], opts: { scopeTenantId?: string | null } = {}): Promise<PostedProposals> {
  const [{ getTool }, store] = await Promise.all([import('@/lib/agent/tools'), import('@/lib/agent/store')])
  const conv = await store.createConversation(caller, title, opts.scopeTenantId ?? null)
  const ctx = { caller, conversationId: conv.id }
  const calls: { id: string; tool: string; args: Record<string, unknown> }[] = []
  const prepared: { callId: string; action?: ProposedAction; error?: string; tool: string }[] = []
  const failed: PostedProposals['failed'] = []

  for (const d of drafts) {
    const callId = `auto-${randomUUID().slice(0, 8)}`
    const tool = getTool(d.tool)
    if (!tool || tool.kind !== 'write' || !tool.propose) { failed.push({ tool: d.tool, error: 'not a write tool' }); continue }
    try {
      const args = (await tool.parse(d.args, ctx)) as Record<string, unknown>
      const { title: t, preview } = await tool.propose(args, ctx)
      const created = Date.now()
      const action: ProposedAction = {
        id: randomUUID(), conversationId: conv.id, tool: tool.name,
        risk: tool.risk === 'none' ? 'update' : tool.risk,
        title: String(t || tool.name).slice(0, 300), preview: preview ?? {}, args,
        status: 'pending', created_by: caller.userId, tenant_id: caller.tenantId,
        created_at: new Date(created).toISOString(), expires_at: new Date(created + PROPOSAL_TTL_MS).toISOString(),
      }
      await store.saveAction(action)
      calls.push({ id: callId, tool: tool.name, args })
      prepared.push({ callId, action, tool: tool.name })
    } catch (e) {
      const msg = (e as Error)?.message || 'failed'
      failed.push({ tool: d.tool, error: msg.slice(0, 200) })
      logger.warn(`[assistants] could not draft ${d.tool}: ${msg.slice(0, 120)}`)
    }
  }

  // Hidden app note first so the model history (which starts at a user turn) includes the drafts.
  await store.appendUserMessage(caller, conv.id, `[App note, not typed by the admin] A scheduled assistant ran: ${title}. Its drafts follow; treat them like your own proposals.`, { hidden: true, kind: 'action_update' })
  await store.appendTurnMessage(caller, conv.id, { message: { role: 'assistant', content: intro, ...(calls.length ? { toolCalls: calls.map((c) => ({ id: c.id, name: c.tool, args: c.args })) } : {}) } })
  for (const p of prepared) {
    await store.appendTurnMessage(caller, conv.id, {
      message: {
        role: 'tool', toolCallId: p.callId, toolName: p.tool,
        content: JSON.stringify({ tool: p.tool, status: 'awaiting_confirmation', data: { action_id: p.action!.id, title: p.action!.title, note: 'Drafted by a scheduled assistant. Nothing has changed yet; the admin must confirm it.' } }),
      },
      ui: { ok: true, summary: 'Draft ready for your review', actionId: p.action!.id },
    })
  }
  await store.touchConversation(caller, conv.id).catch(() => undefined)
  return { conversation_id: conv.id, action_ids: prepared.map((p) => p.action!.id), failed }
}
