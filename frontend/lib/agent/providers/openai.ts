/**
 * OpenAI-compatible chat completions adapter (OpenAI, OpenRouter, Groq,
 * NVIDIA, Cerebras, Mistral, DeepSeek, OpenCode Zen, custom gateways).
 */
import { readSse, safeJsonParse, parseToolArgs } from './sse'
import { toJsonSchema } from './schema'
import {
  ProviderHttpError,
  type ChatChunk,
  type ChatMessage,
  type ChatProvider,
  type ChatRequest,
  type FetchLike,
  type StopReason,
  type ToolSpec,
  type ProviderTarget,
} from './types'

type OaMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export function toOpenAIMessages(system: string, messages: ChatMessage[]): OaMessage[] {
  const out: OaMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') {
      const calls = m.toolCalls ?? []
      out.push({
        role: 'assistant',
        content: m.content || (calls.length ? null : ''),
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
              })),
            }
          : {}),
      })
    } else {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content })
    }
  }
  return out
}

export function toOpenAITools(tools: ToolSpec[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: toJsonSchema(t.parameters) },
  }))
}

/** Providers known to reject `stream_options`. */
const NO_STREAM_OPTIONS = new Set(['mistral'])

export function toOpenAIRequest(target: Pick<ProviderTarget, 'provider' | 'model'>, req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: target.model,
    messages: toOpenAIMessages(req.system, req.messages),
    stream: true,
  }
  // Reasoning-family OpenAI models only accept max_completion_tokens.
  if (target.provider === 'openai' && /^(o\d|gpt-5)/.test(target.model)) body.max_completion_tokens = req.maxTokens
  else body.max_tokens = req.maxTokens
  if (!NO_STREAM_OPTIONS.has(target.provider)) body.stream_options = { include_usage: true }
  if (req.tools.length) {
    body.tools = toOpenAITools(req.tools)
    body.tool_choice = 'auto'
  }
  return body
}

function mapFinish(reason: string | null | undefined, sawTools: boolean): StopReason {
  if (reason === 'tool_calls' || reason === 'function_call') return 'tool_calls'
  if (reason === 'length') return 'max_tokens'
  if (reason === 'stop' || reason === 'end_turn') return sawTools ? 'tool_calls' : 'end'
  return sawTools ? 'tool_calls' : reason ? 'other' : 'end'
}

interface OaDelta {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null
  error?: { message?: string; code?: string | number }
}

/** Turn an OpenAI-style SSE stream into normalised chunks. */
export async function* parseOpenAIStream(body: ReadableStream<Uint8Array>, provider: string, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
  const calls = new Map<number, { id: string; name: string; args: string }>()
  let finish: string | null = null
  let inputTokens = 0
  let outputTokens = 0
  for await (const ev of readSse(body, signal)) {
    if (ev.data === '[DONE]') break
    const json = safeJsonParse(ev.data) as OaDelta | undefined
    if (!json) continue
    if (json.error) throw new ProviderHttpError(Number(json.error.code) || 500, json.error.message || 'stream error', provider)
    if (json.usage) {
      inputTokens = json.usage.prompt_tokens ?? inputTokens
      outputTokens = json.usage.completion_tokens ?? outputTokens
    }
    const choice = json.choices?.[0]
    if (!choice) continue
    const d = choice.delta
    if (d?.content) yield { type: 'text', delta: d.content }
    for (const tc of d?.tool_calls ?? []) {
      const idx = tc.index ?? calls.size
      const cur = calls.get(idx) ?? { id: '', name: '', args: '' }
      if (tc.id) cur.id = tc.id
      if (tc.function?.name) cur.name += tc.function.name
      if (tc.function?.arguments) cur.args += tc.function.arguments
      calls.set(idx, cur)
    }
    if (choice.finish_reason) finish = choice.finish_reason
  }
  const ordered = [...calls.entries()].sort((a, b) => a[0] - b[0])
  for (const [idx, c] of ordered) {
    if (!c.name) continue
    yield { type: 'tool_call', call: { id: c.id || `call_${idx}_${Date.now().toString(36)}`, name: c.name, args: parseToolArgs(c.args) } }
  }
  yield { type: 'stop', reason: mapFinish(finish, ordered.length > 0), usage: { inputTokens, outputTokens } }
}

export function createOpenAIProvider(target: ProviderTarget, fetchImpl: FetchLike = fetch): ChatProvider {
  return {
    provider: target.provider,
    model: target.model,
    async *chat(req) {
      const url = `${target.endpoint.replace(/\/+$/, '')}/chat/completions`
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.apiKey}`,
      }
      if (target.provider === 'openrouter') {
        headers['HTTP-Referer'] = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'
        headers['X-Title'] = 'CodeSpectra admin copilot'
      }
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(toOpenAIRequest(target, req)),
        signal: req.signal,
      })
      if (!res.ok || !res.body) throw new ProviderHttpError(res.status, await res.text().catch(() => ''), target.provider)
      yield* parseOpenAIStream(res.body, target.provider, req.signal)
    },
  }
}
