/**
 * Stored agent messages ↔ model history. Pure (no DB) so it is unit-tested.
 */
import type { KnowledgeHit } from '@/lib/agent/contract'
import type { ChatMessage, ToolCall } from '@/lib/agent/providers/types'

export interface AgentMessageDoc {
  id: string
  conversation_id: string
  owner_id: string
  tenant_id: string | null
  seq: number
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; tool: string; args: unknown; meta?: Record<string, unknown> }[]
  tool_call_id?: string
  tool_name?: string
  is_error?: boolean
  /** UI facts for tool messages. */
  ok?: boolean
  summary?: string
  citations?: KnowledgeHit[]
  action_id?: string
  /** Loop v2 UI facts (persisted so a reloaded conversation shows the same thing). */
  action_ids?: string[]
  bundle_id?: string
  plan?: { id: string; title: string; tool?: string; status: string }[]
  clarify?: { question: string; options?: string[] }
  specialist?: string
  /** App-generated notes (action confirmed/cancelled) — sent to the model, not shown as chat bubbles. */
  kind?: 'action_update'
  hidden?: boolean
  created_at: string
}

export const HISTORY_MESSAGE_LIMIT = 40

/** Conversation title from the first message: plain text, ≤ 60 chars, cut on a word. */
export function makeTitle(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>\[\]()~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return 'New conversation'
  if (plain.length <= 60) return plain[0].toUpperCase() + plain.slice(1)
  const cut = plain.slice(0, 60)
  const sp = cut.lastIndexOf(' ')
  const t = (sp > 30 ? cut.slice(0, sp) : cut).replace(/[,.;:\-–—]+$/, '')
  return `${t[0].toUpperCase()}${t.slice(1)}…`
}

/** Stored docs → provider history: last N messages, starting at a user turn, no dangling tool calls. */
export function buildHistory(docs: AgentMessageDoc[], limit = HISTORY_MESSAGE_LIMIT): ChatMessage[] {
  const sorted = [...docs].sort((a, b) => a.seq - b.seq)
  let slice = sorted.slice(-limit)
  const firstUser = slice.findIndex((d) => d.role === 'user')
  slice = firstUser >= 0 ? slice.slice(firstUser) : []

  const out: ChatMessage[] = []
  let open = new Map<string, string>() // tool_call_id → tool name awaiting a result
  const closeOpen = () => {
    for (const [id, name] of open) {
      out.push({
        role: 'tool',
        toolCallId: id,
        toolName: name,
        content: JSON.stringify({ tool: name, status: 'cancelled', error: 'The admin stopped this step before it finished.' }),
        isError: true,
      })
    }
    open = new Map()
  }

  for (const d of slice) {
    if (d.role === 'tool') {
      if (!d.tool_call_id || !open.has(d.tool_call_id)) continue // orphan result
      open.delete(d.tool_call_id)
      out.push({ role: 'tool', toolCallId: d.tool_call_id, toolName: d.tool_name || 'tool', content: d.content, ...(d.is_error ? { isError: true } : {}) })
      continue
    }
    closeOpen()
    if (d.role === 'user') {
      out.push({ role: 'user', content: d.content })
    } else {
      const calls: ToolCall[] = (d.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.tool,
        args: (c.args && typeof c.args === 'object' ? c.args : {}) as Record<string, unknown>,
        ...(c.meta ? { meta: c.meta } : {}),
      }))
      out.push({ role: 'assistant', content: d.content || '', ...(calls.length ? { toolCalls: calls } : {}) })
      for (const c of calls) open.set(c.id, c.name)
    }
  }
  closeOpen()
  return out
}

/** Model-facing note appended when the admin confirms / cancels a proposal. */
export function actionUpdateNote(a: { title: string; status: string; result?: { ok: boolean; message: string; link?: string } }): string {
  const what =
    a.status === 'done' ? 'confirmed and it completed'
    : a.status === 'failed' ? 'confirmed but it failed'
    : a.status === 'cancelled' ? 'cancelled'
    : a.status === 'expired' ? 'let expire'
    : a.status
  const res = a.result ? ` Result: ${a.result.message}${a.result.link ? ` (${a.result.link})` : ''}` : ''
  return `[App note, not typed by the admin] The admin ${what} the proposal “${a.title}”.${res}`
}
