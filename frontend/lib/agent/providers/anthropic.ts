/** Anthropic Messages API adapter (tool_use / tool_result content blocks). */
import { readSse, safeJsonParse, parseToolArgs } from './sse'
import { toJsonSchema } from './schema'
import {
  ProviderHttpError,
  type ChatChunk,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type FetchLike,
  type ProviderTarget,
  type StopReason,
  type ToolSpec,
} from './types'

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }

interface AnMessage {
  role: 'user' | 'assistant'
  content: Block[]
}

/** Anthropic tool ids must match ^[a-zA-Z0-9_-]+$ (ids may come from another provider). */
export function anthropicToolId(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, '_')
  return clean || 'toolu_x'
}

export function toAnthropicMessages(messages: ChatMessage[]): AnMessage[] {
  const out: AnMessage[] = []
  const push = (role: AnMessage['role'], blocks: Block[]) => {
    if (!blocks.length) return
    const last = out[out.length - 1]
    // Consecutive same-role turns are merged (tool results + a following user note, etc.).
    if (last && last.role === role) last.content.push(...blocks)
    else out.push({ role, content: blocks })
  }
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.content.trim()) push('user', [{ type: 'text', text: m.content }])
    } else if (m.role === 'assistant') {
      const blocks: Block[] = []
      if (m.content.trim()) blocks.push({ type: 'text', text: m.content })
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: anthropicToolId(c.id), name: c.name, input: c.args ?? {} })
      if (!blocks.length) blocks.push({ type: 'text', text: '(no reply)' })
      push('assistant', blocks)
    } else {
      push('user', [{
        type: 'tool_result',
        tool_use_id: anthropicToolId(m.toolCallId),
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      }])
    }
  }
  // The API requires the conversation to start with a user turn.
  if (out[0]?.role === 'assistant') out.unshift({ role: 'user', content: [{ type: 'text', text: '(conversation continues)' }] })
  return out
}

export function toAnthropicTools(tools: ToolSpec[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: toJsonSchema(t.parameters) }))
}

export function toAnthropicRequest(model: string, req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    system: req.system,
    max_tokens: req.maxTokens,
    messages: toAnthropicMessages(req.messages),
    stream: true,
  }
  if (req.tools.length) body.tools = toAnthropicTools(req.tools)
  return body
}

function mapStop(r: string | null): StopReason {
  if (r === 'tool_use') return 'tool_calls'
  if (r === 'max_tokens') return 'max_tokens'
  if (r === 'end_turn' || r === 'stop_sequence' || r === null) return 'end'
  return 'other'
}

interface AnEvent {
  type?: string
  index?: number
  message?: { usage?: { input_tokens?: number; output_tokens?: number } }
  content_block?: { type?: string; id?: string; name?: string }
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string | null }
  usage?: { input_tokens?: number; output_tokens?: number }
  error?: { type?: string; message?: string }
}

export async function* parseAnthropicStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
  const blocks = new Map<number, { id: string; name: string; json: string }>()
  let inputTokens = 0
  let outputTokens = 0
  let stop: string | null = null
  for await (const ev of readSse(body, signal)) {
    const e = safeJsonParse(ev.data) as AnEvent | undefined
    if (!e) continue
    const type = e.type ?? ev.event
    switch (type) {
      case 'message_start':
        inputTokens = e.message?.usage?.input_tokens ?? 0
        outputTokens = e.message?.usage?.output_tokens ?? 0
        break
      case 'content_block_start':
        if (e.content_block?.type === 'tool_use') {
          blocks.set(e.index ?? 0, { id: e.content_block.id || '', name: e.content_block.name || '', json: '' })
        }
        break
      case 'content_block_delta':
        if (e.delta?.type === 'text_delta' && e.delta.text) yield { type: 'text', delta: e.delta.text }
        else if (e.delta?.type === 'input_json_delta') {
          const b = blocks.get(e.index ?? 0)
          if (b) b.json += e.delta.partial_json ?? ''
        }
        break
      case 'content_block_stop': {
        const b = blocks.get(e.index ?? 0)
        if (b) {
          blocks.delete(e.index ?? 0)
          yield { type: 'tool_call', call: { id: b.id, name: b.name, args: parseToolArgs(b.json) } }
        }
        break
      }
      case 'message_delta':
        if (e.delta?.stop_reason !== undefined) stop = e.delta.stop_reason ?? null
        if (e.usage?.output_tokens !== undefined) outputTokens = e.usage.output_tokens
        if (e.usage?.input_tokens) inputTokens = e.usage.input_tokens
        break
      case 'error': {
        const t = e.error?.type || ''
        const status = t === 'overloaded_error' ? 529 : t === 'rate_limit_error' ? 429 : 500
        throw new ProviderHttpError(status, e.error?.message || t || 'stream error', 'anthropic')
      }
      default:
        break
    }
  }
  yield { type: 'stop', reason: mapStop(stop), usage: { inputTokens, outputTokens } }
}

export function createAnthropicProvider(target: ProviderTarget, fetchImpl: FetchLike = fetch): ChatProvider {
  return {
    provider: target.provider,
    model: target.model,
    async *chat(req) {
      const base = (target.endpoint || 'https://api.anthropic.com/v1').replace(/\/+$/, '')
      const res = await fetchImpl(`${base}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': target.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(toAnthropicRequest(target.model, req)),
        signal: req.signal,
      })
      if (!res.ok || !res.body) throw new ProviderHttpError(res.status, await res.text().catch(() => ''), target.provider)
      yield* parseAnthropicStream(res.body, req.signal)
    },
  }
}
