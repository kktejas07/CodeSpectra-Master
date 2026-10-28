/**
 * Provider-agnostic chat interface for the admin agent.
 *
 * Every adapter (OpenAI-compatible, Anthropic, Gemini) converts the same
 * normalised conversation + tool list into its own wire format and streams
 * back the same chunks, so the agent loop never sees provider details.
 */
import type { JsonSchema } from '@/lib/agent/contract'

export interface ToolSpec {
  name: string
  description: string
  parameters: JsonSchema
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  /** Provider-specific data that must be echoed back (e.g. Gemini thoughtSignature). */
  meta?: Record<string, unknown>
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string; isError?: boolean }

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
}

export type StopReason = 'end' | 'tool_calls' | 'max_tokens' | 'other'

export type ChatChunk =
  | { type: 'meta'; provider: string; model: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'stop'; reason: StopReason; usage: ChatUsage }

export interface ChatRequest {
  system: string
  messages: ChatMessage[]
  tools: ToolSpec[]
  maxTokens: number
  signal?: AbortSignal
}

export interface ChatProvider {
  readonly provider: string
  readonly model: string
  chat(req: ChatRequest): AsyncIterable<ChatChunk>
}

export type AdapterKind = 'openai' | 'anthropic' | 'gemini'

/** One resolved provider/model/key to try. */
export interface ProviderTarget {
  kind: AdapterKind
  provider: string
  model: string
  endpoint: string
  apiKey: string
}

/** HTTP failure from a provider — `status` drives the fallback decision. */
export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly provider: string,
  ) {
    super(`${provider} API error (${status}): ${body.slice(0, 300)}`)
    this.name = 'ProviderHttpError'
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>
