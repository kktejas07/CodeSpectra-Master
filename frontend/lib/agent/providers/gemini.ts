/** Google Gemini adapter (functionDeclarations / functionCall / functionResponse). */
import { readSse, safeJsonParse } from './sse'
import { isEmptyObjectSchema, toGeminiSchema } from './schema'
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

type Part =
  | { text: string; thought?: boolean; thoughtSignature?: string }
  | { functionCall: { name: string; args: Record<string, unknown>; id?: string }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown>; id?: string } }

interface Content {
  role: 'user' | 'model'
  parts: Part[]
}

/**
 * Gemini 3 rejects a replayed function call without its thought signature.
 * Calls produced by another provider (fallback) have none, so the documented
 * bypass value is sent on the first call of that model turn instead.
 */
export const GEMINI_SKIP_SIGNATURE = 'skip_thought_signature_validator'

export function toGeminiContents(messages: ChatMessage[]): Content[] {
  const out: Content[] = []
  const geminiIds = new Map<string, string>()
  const push = (role: Content['role'], parts: Part[]) => {
    if (!parts.length) return
    const last = out[out.length - 1]
    if (last && last.role === role) last.parts.push(...parts)
    else out.push({ role, parts })
  }
  for (const m of messages) {
    if (m.role === 'user') {
      if (m.content.trim()) push('user', [{ text: m.content }])
    } else if (m.role === 'assistant') {
      const parts: Part[] = []
      if (m.content.trim()) parts.push({ text: m.content })
      ;(m.toolCalls ?? []).forEach((c, i) => {
        const sig = typeof c.meta?.thoughtSignature === 'string' ? c.meta.thoughtSignature : undefined
        const gid = typeof c.meta?.geminiId === 'string' ? c.meta.geminiId : undefined
        if (gid) geminiIds.set(c.id, gid)
        parts.push({
          functionCall: { name: c.name, args: c.args ?? {}, ...(gid ? { id: gid } : {}) },
          ...(sig ? { thoughtSignature: sig } : i === 0 ? { thoughtSignature: GEMINI_SKIP_SIGNATURE } : {}),
        })
      })
      if (!parts.length) parts.push({ text: '(no reply)' })
      push('model', parts)
    } else {
      const parsed = safeJsonParse(m.content)
      const response = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : { content: parsed ?? m.content }
      const gid = geminiIds.get(m.toolCallId)
      push('user', [{ functionResponse: { name: m.toolName, response, ...(gid ? { id: gid } : {}) } }])
    }
  }
  if (out[0]?.role === 'model') out.unshift({ role: 'user', parts: [{ text: '(conversation continues)' }] })
  return out
}

export function toGeminiTools(tools: ToolSpec[]) {
  if (!tools.length) return undefined
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      ...(isEmptyObjectSchema(t.parameters) ? {} : { parameters: toGeminiSchema(t.parameters) }),
    })),
  }]
}

export function toGeminiRequest(req: ChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: toGeminiContents(req.messages),
    generationConfig: { maxOutputTokens: req.maxTokens },
  }
  const tools = toGeminiTools(req.tools)
  if (tools) {
    body.tools = tools
    body.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }
  }
  return body
}

interface GemChunk {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
  error?: { code?: number; message?: string }
}

function mapFinish(r: string | undefined, sawTools: boolean): StopReason {
  if (sawTools) return 'tool_calls'
  if (!r || r === 'STOP') return 'end'
  if (r === 'MAX_TOKENS') return 'max_tokens'
  return 'other'
}

export async function* parseGeminiStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<ChatChunk> {
  let inputTokens = 0
  let outputTokens = 0
  let finish: string | undefined
  let n = 0
  for await (const ev of readSse(body, signal)) {
    const json = safeJsonParse(ev.data) as GemChunk | undefined
    if (!json) continue
    if (json.error) throw new ProviderHttpError(json.error.code || 500, json.error.message || 'stream error', 'gemini')
    if (json.usageMetadata) {
      inputTokens = json.usageMetadata.promptTokenCount ?? inputTokens
      outputTokens = (json.usageMetadata.candidatesTokenCount ?? 0) + (json.usageMetadata.thoughtsTokenCount ?? 0) || outputTokens
    }
    const cand = json.candidates?.[0]
    if (!cand) continue
    for (const p of cand.content?.parts ?? []) {
      if ('functionCall' in p && p.functionCall) {
        const meta: Record<string, unknown> = {}
        if (p.thoughtSignature) meta.thoughtSignature = p.thoughtSignature
        if (p.functionCall.id) meta.geminiId = p.functionCall.id
        n++
        yield {
          type: 'tool_call',
          call: {
            id: p.functionCall.id || `gem_${Date.now().toString(36)}_${n}`,
            name: p.functionCall.name,
            args: (p.functionCall.args && typeof p.functionCall.args === 'object') ? p.functionCall.args : {},
            ...(Object.keys(meta).length ? { meta } : {}),
          },
        }
      } else if ('text' in p && typeof p.text === 'string' && p.text && !p.thought) {
        yield { type: 'text', delta: p.text }
      }
    }
    if (cand.finishReason) finish = cand.finishReason
  }
  yield { type: 'stop', reason: mapFinish(finish, n > 0), usage: { inputTokens, outputTokens } }
}

export function createGeminiProvider(target: ProviderTarget, fetchImpl: FetchLike = fetch): ChatProvider {
  return {
    provider: target.provider,
    model: target.model,
    async *chat(req) {
      const base = (target.endpoint || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '')
      const url = `${base}/models/${encodeURIComponent(target.model)}:streamGenerateContent?alt=sse`
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': target.apiKey },
        body: JSON.stringify(toGeminiRequest(req)),
        signal: req.signal,
      })
      if (!res.ok || !res.body) throw new ProviderHttpError(res.status, await res.text().catch(() => ''), target.provider)
      yield* parseGeminiStream(res.body, req.signal)
    },
  }
}
