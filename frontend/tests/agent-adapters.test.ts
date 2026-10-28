/**
 * Admin agent provider adapters: message/tool conversion and stream parsing
 * per provider, from fixtures (no network), plus the fallback walk.
 */
import { describe, it, expect, vi } from 'vitest'
import type { JsonSchema } from '@/lib/agent/contract'
import type { ChatChunk, ChatMessage, ChatRequest, ProviderTarget } from '@/lib/agent/providers/types'
import { ProviderHttpError } from '@/lib/agent/providers/types'
import { toOpenAIRequest, parseOpenAIStream, createOpenAIProvider } from '@/lib/agent/providers/openai'
import { toAnthropicMessages, toAnthropicRequest, parseAnthropicStream, anthropicToolId } from '@/lib/agent/providers/anthropic'
import { toGeminiContents, toGeminiRequest, parseGeminiStream, GEMINI_SKIP_SIGNATURE } from '@/lib/agent/providers/gemini'
import { toGeminiSchema, toJsonSchema } from '@/lib/agent/providers/schema'
import { chatWithFallback, adapterKindFor } from '@/lib/agent/providers'

const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder()
      // Split mid-line to exercise buffering.
      for (let i = 0; i < text.length; i += 17) c.enqueue(enc.encode(text.slice(i, i + 17)))
      c.close()
    },
  })

async function collect(it: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = []
  for await (const c of it) out.push(c)
  return out
}

const PARAMS: JsonSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'What to look for', maxLength: 200 },
    level: { type: 'integer', enum: [1, 2, 3] },
    kind: { type: 'string', enum: ['test', 'hackathon'] },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['query', 'missing_prop'],
}

const HISTORY: ChatMessage[] = [
  { role: 'user', content: 'Find java tests' },
  {
    role: 'assistant',
    content: 'Looking.',
    toolCalls: [
      { id: 'call:1', name: 'search_knowledge', args: { query: 'java' } },
      { id: 'call:2', name: 'list_tests', args: {} },
    ],
  },
  { role: 'tool', toolCallId: 'call:1', toolName: 'search_knowledge', content: '{"tool":"search_knowledge","status":"ok","untrusted_data":[1]}' },
  { role: 'tool', toolCallId: 'call:2', toolName: 'list_tests', content: '{"status":"ok"}', isError: true },
]

const REQ: ChatRequest = {
  system: 'SYS',
  messages: HISTORY,
  tools: [{ name: 'search_knowledge', description: 'Search', parameters: PARAMS }],
  maxTokens: 512,
}

describe('schema conversion', () => {
  it('JSON schema keeps the contract subset and drops unknown required keys', () => {
    const s = toJsonSchema(PARAMS)
    expect(s).toMatchObject({ type: 'object', required: ['query'] })
    expect((s.properties as Record<string, unknown>).query).toEqual({ type: 'string', description: 'What to look for', maxLength: 200 })
  })

  it('Gemini schema uses upper-case types, string enums and folds constraints into descriptions', () => {
    const g = toGeminiSchema(PARAMS) as { type: string; properties: Record<string, Record<string, unknown>>; required: string[] }
    expect(g.type).toBe('OBJECT')
    expect(g.required).toEqual(['query'])
    expect(g.properties.query).toEqual({ type: 'STRING', description: 'What to look for At most 200 characters.' })
    expect(g.properties.level.enum).toBeUndefined()
    expect(g.properties.level.description).toBe('One of: 1, 2, 3.')
    expect(g.properties.kind.enum).toEqual(['test', 'hackathon'])
    expect(g.properties.tags).toEqual({ type: 'ARRAY', items: { type: 'STRING' }, maxItems: '5' })
  })
})

describe('OpenAI-compatible adapter', () => {
  it('converts history: system first, tool_calls with JSON-string args, tool messages', () => {
    const body = toOpenAIRequest({ provider: 'groq', model: 'm' }, REQ) as Record<string, any>
    expect(body.model).toBe('m')
    expect(body.stream).toBe(true)
    expect(body.max_tokens).toBe(512)
    expect(body.stream_options).toEqual({ include_usage: true })
    expect(body.tool_choice).toBe('auto')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' })
    expect(body.messages[2]).toEqual({
      role: 'assistant',
      content: 'Looking.',
      tool_calls: [
        { id: 'call:1', type: 'function', function: { name: 'search_knowledge', arguments: '{"query":"java"}' } },
        { id: 'call:2', type: 'function', function: { name: 'list_tests', arguments: '{}' } },
      ],
    })
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call:1', content: HISTORY[2].role === 'tool' ? HISTORY[2].content : '' })
    expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'search_knowledge', parameters: { type: 'object' } } })
  })

  it('uses max_completion_tokens for OpenAI reasoning models and no stream_options for Mistral', () => {
    expect(toOpenAIRequest({ provider: 'openai', model: 'o3-mini' }, REQ)).toHaveProperty('max_completion_tokens', 512)
    expect(toOpenAIRequest({ provider: 'mistral', model: 'x' }, REQ)).not.toHaveProperty('stream_options')
  })

  it('parses text deltas, fragmented tool calls and usage', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"search_","arguments":"{\\"qu"}}]}}]}',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"knowledge","arguments":"ery\\":\\"java\\"}"}}]}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7}}',
      'data: [DONE]',
      '',
    ].join('\n\n')
    const chunks = await collect(parseOpenAIStream(streamOf(sse), 'openai'))
    expect(chunks).toEqual([
      { type: 'text', delta: 'Hel' },
      { type: 'text', delta: 'lo' },
      { type: 'tool_call', call: { id: 'c1', name: 'search_knowledge', args: { query: 'java' } } },
      { type: 'stop', reason: 'tool_calls', usage: { inputTokens: 11, outputTokens: 7 } },
    ])
  })

  it('throws ProviderHttpError with the status on a failed request', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"rate limited"}', { status: 429 }))
    const p = createOpenAIProvider({ kind: 'openai', provider: 'groq', model: 'm', endpoint: 'https://x/v1/', apiKey: 'k' }, fetchImpl)
    await expect(collect(p.chat(REQ))).rejects.toMatchObject({ status: 429 })
    expect(fetchImpl).toHaveBeenCalledWith('https://x/v1/chat/completions', expect.objectContaining({ method: 'POST' }))
  })
})

describe('Anthropic adapter', () => {
  it('maps tool calls to tool_use blocks and merges consecutive tool results into one user turn', () => {
    const msgs = toAnthropicMessages(HISTORY)
    expect(msgs).toHaveLength(3)
    expect(msgs[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Looking.' },
        { type: 'tool_use', id: 'call_1', name: 'search_knowledge', input: { query: 'java' } },
        { type: 'tool_use', id: 'call_2', name: 'list_tests', input: {} },
      ],
    })
    expect(msgs[2].role).toBe('user')
    expect(msgs[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 'call_1', content: (HISTORY[2] as { content: string }).content },
      { type: 'tool_result', tool_use_id: 'call_2', content: '{"status":"ok"}', is_error: true },
    ])
    expect(anthropicToolId('gem_1/x')).toBe('gem_1_x')
  })

  it('builds the request with system + input_schema tools', () => {
    const body = toAnthropicRequest('claude-x', REQ) as Record<string, any>
    expect(body).toMatchObject({ model: 'claude-x', system: 'SYS', max_tokens: 512, stream: true })
    expect(body.tools[0]).toMatchObject({ name: 'search_knowledge', input_schema: { type: 'object', required: ['query'] } })
  })

  it('parses text, input_json_delta tool calls, stop reason and usage', async () => {
    const ev = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
    const sse =
      ev('message_start', { type: 'message_start', message: { usage: { input_tokens: 20, output_tokens: 1 } } }) +
      ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }) +
      ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sure.' } }) +
      ev('content_block_stop', { type: 'content_block_stop', index: 0 }) +
      ev('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'list_tests', input: {} } }) +
      ev('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"limit":' } }) +
      ev('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '5}' } }) +
      ev('content_block_stop', { type: 'content_block_stop', index: 1 }) +
      ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 9 } }) +
      ev('message_stop', { type: 'message_stop' })
    const chunks = await collect(parseAnthropicStream(streamOf(sse)))
    expect(chunks).toEqual([
      { type: 'text', delta: 'Sure.' },
      { type: 'tool_call', call: { id: 'toolu_1', name: 'list_tests', args: { limit: 5 } } },
      { type: 'stop', reason: 'tool_calls', usage: { inputTokens: 20, outputTokens: 9 } },
    ])
  })

  it('turns an overloaded stream error into a retryable ProviderHttpError', async () => {
    const sse = `event: error\ndata: ${JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } })}\n\n`
    await expect(collect(parseAnthropicStream(streamOf(sse)))).rejects.toMatchObject({ status: 529 })
  })
})

describe('Gemini adapter', () => {
  it('maps calls to functionCall parts (with signature fallback) and results to functionResponse', () => {
    const contents = toGeminiContents(HISTORY)
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user'])
    expect(contents[1].parts).toEqual([
      { text: 'Looking.' },
      { functionCall: { name: 'search_knowledge', args: { query: 'java' } }, thoughtSignature: GEMINI_SKIP_SIGNATURE },
      { functionCall: { name: 'list_tests', args: {} } },
    ])
    expect(contents[2].parts).toEqual([
      { functionResponse: { name: 'search_knowledge', response: { tool: 'search_knowledge', status: 'ok', untrusted_data: [1] } } },
      { functionResponse: { name: 'list_tests', response: { status: 'ok' } } },
    ])
  })

  it('echoes a captured thought signature and Gemini call id', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'g1', name: 'list_tests', args: {}, meta: { thoughtSignature: 'SIG', geminiId: 'g1' } }] },
      { role: 'tool', toolCallId: 'g1', toolName: 'list_tests', content: 'plain text' },
    ])
    expect(contents[1].parts[0]).toEqual({ functionCall: { name: 'list_tests', args: {}, id: 'g1' }, thoughtSignature: 'SIG' })
    expect(contents[2].parts[0]).toEqual({ functionResponse: { name: 'list_tests', response: { content: 'plain text' }, id: 'g1' } })
  })

  it('builds systemInstruction, functionDeclarations and omits parameters for no-arg tools', () => {
    const body = toGeminiRequest({ ...REQ, tools: [...REQ.tools, { name: 'whoami', description: 'Me', parameters: { type: 'object' } }] }) as Record<string, any>
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'SYS' }] })
    expect(body.generationConfig).toEqual({ maxOutputTokens: 512 })
    expect(body.tools[0].functionDeclarations[0].parameters.type).toBe('OBJECT')
    expect(body.tools[0].functionDeclarations[1]).toEqual({ name: 'whoami', description: 'Me' })
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } })
  })

  it('parses text, skips thought parts, captures functionCall + signature and usage', async () => {
    const d = (o: unknown) => `data: ${JSON.stringify(o)}\r\n\r\n`
    const sse =
      d({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: 'Let me check.' }] } }] }) +
      d({ candidates: [{ content: { parts: [{ functionCall: { name: 'list_tests', args: { limit: 3 } }, thoughtSignature: 'abc' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 6 } })
    const chunks = await collect(parseGeminiStream(streamOf(sse)))
    expect(chunks[0]).toEqual({ type: 'text', delta: 'Let me check.' })
    expect(chunks[1]).toMatchObject({ type: 'tool_call', call: { name: 'list_tests', args: { limit: 3 }, meta: { thoughtSignature: 'abc' } } })
    expect(chunks[2]).toEqual({ type: 'stop', reason: 'tool_calls', usage: { inputTokens: 30, outputTokens: 6 } })
  })
})

describe('provider fallback', () => {
  const t = (provider: string): ProviderTarget => ({ kind: adapterKindFor(provider), provider, model: `${provider}-m`, endpoint: 'https://x', apiKey: `${provider}-key` })

  it('maps providers to adapters', () => {
    expect(adapterKindFor('anthropic')).toBe('anthropic')
    expect(adapterKindFor('gemini')).toBe('gemini')
    expect(adapterKindFor('openrouter')).toBe('openai')
    expect(adapterKindFor('custom')).toBe('openai')
  })

  it('skips a rate-limited provider before any output and marks its key', async () => {
    const onRateLimited = vi.fn()
    const make = (target: ProviderTarget) => ({
      provider: target.provider,
      model: target.model,
      async *chat(): AsyncGenerator<ChatChunk> {
        if (target.provider === 'groq') throw new ProviderHttpError(429, 'Rate limit reached, try again in 12s', 'groq')
        yield { type: 'text', delta: 'ok' }
        yield { type: 'stop', reason: 'end', usage: { inputTokens: 1, outputTokens: 1 } }
      },
    })
    const chunks = await collect(chatWithFallback([t('groq'), t('gemini')], REQ, { createProvider: make, onRateLimited }))
    expect(chunks[0]).toEqual({ type: 'meta', provider: 'gemini', model: 'gemini-m' })
    expect(chunks[1]).toEqual({ type: 'text', delta: 'ok' })
    expect(onRateLimited).toHaveBeenCalledWith(expect.objectContaining({ provider: 'groq' }), 12_000)
  })

  it('does not switch providers once output has streamed (keeps tool-call semantics)', async () => {
    const second = vi.fn()
    const make = (target: ProviderTarget) => ({
      provider: target.provider,
      model: target.model,
      async *chat(): AsyncGenerator<ChatChunk> {
        if (target.provider === 'openai') {
          yield { type: 'text', delta: 'partial' }
          throw new ProviderHttpError(500, 'boom', 'openai')
        }
        second()
      },
    })
    await expect(collect(chatWithFallback([t('openai'), t('anthropic')], REQ, { createProvider: make }))).rejects.toMatchObject({ status: 500 })
    expect(second).not.toHaveBeenCalled()
  })

  it('reports when no provider is configured', async () => {
    await expect(collect(chatWithFallback([], REQ))).rejects.toThrow(/No AI model is configured/)
  })
})
