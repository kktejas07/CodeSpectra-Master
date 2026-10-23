/**
 * Thin client wrapper that calls the FastAPI backend's internal AI router.
 *
 * Backend is reachable in-cluster at http://localhost:8001 (set via
 * INTERNAL_BACKEND_URL env, defaults to localhost:8001). These calls happen
 * ONLY server-side from Next.js API route handlers — never expose this from
 * the browser.
 *
 * Uses OmniRouter-style provider fallback: when a provider hits rate limits,
 * quota exhaustion, or errors, automatically rotates to the next available
 * provider with exponential backoff.
 *
 * All API keys are resolved via the unified getApiKey() utility which supports:
 * - Round-robin across multiple keys per provider
 * - Rate-limit detection and automatic rotation
 * - Fallback to environment variables
 */

import { internalBackendUrl } from '@/lib/ai/internal-backend-url'
import { estimateTokens, reportAiUsage } from '@/lib/ai/usage-meter'

// AGT-027: INTERNAL_BACKEND_URL is required in production (no baked-in host).
const backendBase = () => internalBackendUrl()

async function getBackendSecrets(): Promise<{
  anthropic: string; gemini: string; openai: string; openrouter: string; opencode: string; groq: string
}> {
  try {
    const { getApiKey } = await import('@/lib/ai/get-api-key')
    
    const [anthropicKey, geminiKey, openaiKey, openrouterKey, opencodeKey, groqKey] = await Promise.all([
      getApiKey('anthropic'),
      getApiKey('gemini'),
      getApiKey('openai'),
      getApiKey('openrouter'),
      getApiKey('opencode'),
      getApiKey('groq'),
    ])
    
    return {
      anthropic: anthropicKey?.key || '',
      gemini: geminiKey?.key || '',
      openai: openaiKey?.key || '',
      openrouter: openrouterKey?.key || '',
      opencode: opencodeKey?.key || '',
      groq: groqKey?.key || '',
    }
  } catch {
    // Fallback to env vars only
    return {
      anthropic: process.env.ANTHROPIC_API_KEY?.trim() || '',
      gemini: process.env.GEMINI_API_KEY?.trim() || '',
      openai: process.env.OPENAI_API_KEY?.trim() || '',
      openrouter: process.env.OPENROUTER_API_KEY?.trim() || '',
      opencode: process.env.OPENCODE_API_KEY?.trim() || '',
      groq: process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || '',
    }
  }
}

async function getInternalSecret(): Promise<string> {
  const fromEnv = process.env.INTERNAL_BACKEND_SECRET?.trim() || ''
  if (fromEnv) return fromEnv
  try {
    const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
    const secrets = await readServerSecrets()
    const stored = typeof secrets.internal_backend_secret === 'string' ? secrets.internal_backend_secret.trim() : ''
    return stored && !isMaskedSecret(stored) ? stored : ''
  } catch {
    return ''
  }
}

async function backendHeaders(opts?: { apiKeyOverride?: string }): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const internalSecret = await getInternalSecret()
  if (internalSecret) h['x-internal-secret'] = internalSecret
  if (opts?.apiKeyOverride) {
    h['x-api-key'] = opts.apiKeyOverride
    h['x-openai-api-key'] = opts.apiKeyOverride
    h['x-gemini-api-key'] = opts.apiKeyOverride
    h['x-anthropic-api-key'] = opts.apiKeyOverride
  }
  const keys = await getBackendSecrets()
  if (keys.anthropic && !h['x-anthropic-api-key']) h['x-anthropic-api-key'] = keys.anthropic
  if (keys.gemini && !h['x-gemini-api-key']) h['x-gemini-api-key'] = keys.gemini
  if (keys.groq && !h['x-openai-api-key']) h['x-openai-api-key'] = keys.groq
  if (keys.openai && !h['x-openai-api-key']) h['x-openai-api-key'] = keys.openai
  const activeKey = keys.openai || keys.openrouter || keys.opencode || keys.anthropic || keys.gemini
  if (activeKey && !h['x-api-key']) h['x-api-key'] = activeKey
  if (activeKey && !h['x-openai-api-key']) h['x-openai-api-key'] = activeKey
  return h
}

export interface ChatHistoryMsg {
  role: 'user' | 'assistant'
  content: string
}

interface ChatStreamArgs {
  sessionId: string
  systemMessage?: string
  history?: ChatHistoryMsg[]
  userMessage: string
  modelRole?: 'reasoning' | 'fast'
  providerOverride?: string
  modelOverride?: string
  endpointOverride?: string
  apiKeyOverride?: string
}

/**
 * Streams Server-Sent Events from the backend `/internal/ai/chat` endpoint.
 * Returns the raw upstream Response so the API route can re-stream it
 * directly to the browser with minimal overhead.
 */
export async function backendChatStream(args: ChatStreamArgs): Promise<Response> {
  const headers = await backendHeaders({ apiKeyOverride: args.apiKeyOverride })
  const res = await fetch(`${backendBase()}/internal/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: args.sessionId,
      system_message: args.systemMessage,
      history: args.history ?? [],
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'reasoning',
      ...(args.providerOverride && args.modelOverride ? {
        provider_override: args.providerOverride,
        model_override: args.modelOverride,
        endpoint_override: args.endpointOverride || '',
      } : {}),
      ...(args.apiKeyOverride ? { api_key_override: args.apiKeyOverride } : {}),
    }),
  })
  return res
}

/**
 * Best-effort extraction of token counts from a completion result.
 * Backend responses often lack usage entirely — all fields optional.
 * Handles both OpenAI-style (prompt_tokens/completion_tokens) and
 * normalized (input_tokens/output_tokens) shapes, top-level or nested.
 */
function extractUsageTokens(res: unknown): { promptTokens?: number; completionTokens?: number; cachedTokens?: number; estimated?: boolean } {
  try {
    const root = res as Record<string, unknown> | null | undefined
    const usage = (root?.usage ?? (root?.json as Record<string, unknown> | undefined)?.usage) as
      | Record<string, unknown>
      | null
      | undefined
    if (!usage || typeof usage !== 'object') return {}
    const pick = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined
    const promptTokens =
      pick(usage.prompt_tokens) ?? pick(usage.input_tokens) ?? pick(usage.promptTokens) ?? pick(usage.inputTokens)
    const completionTokens =
      pick(usage.completion_tokens) ?? pick(usage.output_tokens) ?? pick(usage.completionTokens) ?? pick(usage.outputTokens)
    const details = (usage.prompt_tokens_details ?? {}) as Record<string, unknown>
    const cachedTokens = pick(usage.cached_tokens) ?? pick(details.cached_tokens) ?? pick(usage.cache_read_input_tokens) ?? pick(usage.cachedTokens)
    return {
      ...(promptTokens !== undefined ? { promptTokens } : {}),
      ...(completionTokens !== undefined ? { completionTokens } : {}),
      ...(cachedTokens !== undefined ? { cachedTokens } : {}),
      // The FastAPI backend estimates from characters when the provider sent no counts.
      ...(usage.estimated === true ? { estimated: true } : {}),
    }
  } catch {
    return {}
  }
}

/**
 * Price + record one completion (lib/ai/usage-record): fire-and-forget for the
 * writes, but the cost comes back at once so a usage meter can charge it.
 * Missing token counts are estimated (≈ 4 chars/token) and flagged.
 * Injection flags are LOG-ONLY — the request always proceeds.
 */
async function recordCompletion(
  args: { feature?: string; userId?: string; providerOverride?: string; modelOverride?: string; systemMessage?: string; userMessage?: string },
  res: { provider?: string; model?: string; raw?: string; text?: string; json?: unknown } | undefined,
  latencyMs: number,
  ok: boolean,
  injectionFlags: string[],
  opts: { cacheHit?: boolean } = {},
): Promise<{ provider: string; model: string; inputTokens: number; outputTokens: number; costMicros: number }> {
  const provider = res?.provider || args.providerOverride || 'unknown'
  const model = res?.model || args.modelOverride || 'unknown'
  const tk = extractUsageTokens(res)
  const inputTokens = opts.cacheHit ? 0 : tk.promptTokens ?? estimateTokens(`${args.systemMessage ?? ''}\n${args.userMessage ?? ''}`)
  const outputTokens = opts.cacheHit || !ok ? 0 : tk.completionTokens ?? estimateTokens(res?.raw || res?.text || (res?.json ? JSON.stringify(res.json) : ''))
  try {
    const { recordAiUsage } = await import('@/lib/ai/usage-record')
    const r = recordAiUsage({
      feature: (args.feature || 'unknown') + (opts.cacheHit ? ':cache-hit' : ''),
      provider,
      model,
      inputTokens,
      outputTokens,
      cachedTokens: tk.cachedTokens,
      tokensEstimated: !opts.cacheHit && (tk.estimated === true || tk.promptTokens === undefined || tk.completionTokens === undefined),
      userId: args.userId,
      latencyMs,
      ok,
      injectionFlags,
    })
    return { provider, model, inputTokens, outputTokens, costMicros: r.costMicros }
  } catch {
    // Telemetry must never fail the request.
    return { provider, model, inputTokens, outputTokens, costMicros: 0 }
  }
}

/** Feature id for a raw backend call: "/internal/ai/hints" → "hints", "/internal/learning/courses/x/chat" → "learning-chat". */
export function backendFeatureFor(path: string): string {
  const parts = path.split('?')[0].replace(/^\/internal\//, '').split('/').filter(Boolean)
  if (parts[0] === 'ai') return parts.slice(1).join('-') || 'ai'
  return parts.filter((p) => /^[a-z][a-z-]*$/.test(p) && !/^[0-9a-f-]{16,}$/.test(p)).filter((p, i, a) => i === 0 || i === a.length - 1).join('-') || 'backend'
}

/** Record the calls the FastAPI backend reported in its `x-ai-usage` header (core/ai_usage.py). */
export async function recordHeaderUsage(res: Response, feature: string, userId: string | undefined, latencyMs: number): Promise<void> {
  const raw = res.headers.get('x-ai-usage')
  if (!raw) return
  try {
    const calls = JSON.parse(raw) as Array<{ provider?: string; model?: string; input_tokens?: number; output_tokens?: number; cached_tokens?: number; estimated?: boolean }>
    if (!Array.isArray(calls)) return
    const { recordAiUsage } = await import('@/lib/ai/usage-record')
    for (const c of calls.slice(0, 20)) {
      recordAiUsage({
        feature,
        provider: String(c.provider || 'unknown'),
        model: String(c.model || 'unknown'),
        inputTokens: c.input_tokens,
        outputTokens: c.output_tokens,
        cachedTokens: c.cached_tokens,
        tokensEstimated: c.estimated !== false,
        userId,
        latencyMs,
        ok: res.ok,
      })
    }
  } catch {
    // Telemetry must never fail the request.
  }
}

/** Refuse a non-critical feature when the platform AI budget is used up (hard stop on). */
async function assertAiBudget(feature: string | undefined): Promise<void> {
  const { aiBudgetBlocks, AiBudgetExceededError } = await import('@/lib/ai/usage-record')
  if (await aiBudgetBlocks(feature)) throw new AiBudgetExceededError(feature || 'unknown')
}

export async function backendComplete(args: {
  sessionId?: string
  systemMessage: string
  userMessage: string
  modelRole?: 'reasoning' | 'fast'
  responseFormat?: 'text' | 'json'
  providerOverride?: string
  modelOverride?: string
  endpointOverride?: string
  apiKeyOverride?: string
  feature?: string
  userId?: string
  /** Set false to bypass the semantic response cache (default true). */
  cache?: boolean
}): Promise<{ ok: boolean; text?: string; json?: unknown; raw?: string; usage?: { input_tokens: number, output_tokens: number }; provider?: string; model?: string }> {
  // Phase-3 prompt guard: scan BEFORE the fetch, log-only mode — a flagged
  // prompt still proceeds; flags ride along on the usage log below.
  let injectionFlags: string[] = []
  try {
    const { scanPrompt } = await import('@/lib/ai/prompt-guard')
    injectionFlags = scanPrompt(args.userMessage).reasons
  } catch {
    injectionFlags = []
  }
  const start = Date.now()
  // Semantic cache: exact-normalized prompt hits skip the LLM entirely.
  // Tainted (flagged) prompts never read from or write to the cache.
  const cacheable = args.cache !== false && injectionFlags.length === 0
  let cacheKey = ''
  if (cacheable) {
    try {
      const { cacheKey: buildKey, getCachedCompletion } = await import('@/lib/ai/semantic-cache')
      cacheKey = buildKey({
        feature: args.feature,
        modelRole: args.modelRole,
        providerOverride: args.providerOverride,
        modelOverride: args.modelOverride,
        responseFormat: args.responseFormat,
        systemMessage: args.systemMessage,
        userMessage: args.userMessage,
      })
      const hit = await getCachedCompletion(cacheKey)
      if (hit && (hit.text !== undefined || hit.json !== undefined)) {
        void recordCompletion(args, undefined, Date.now() - start, true, injectionFlags, { cacheHit: true })
        return { ok: true, ...(hit.text !== undefined ? { text: hit.text } : {}), ...(hit.json !== undefined ? { json: hit.json } : {}) }
      }
    } catch {
      cacheKey = ''
    }
  }
  // Platform AI budget hard stop (non-critical features only; lib/ai/spend).
  await assertAiBudget(args.feature)
  // Use OmniRouter-style provider fallback for automatic failover
  const { backendCompleteWithFallback } = await import('@/lib/ai/provider-fallback')
  try {
    const res = await backendCompleteWithFallback(args)
    // Priced + recorded once here; the cost rides along to whoever metered this
    // call (AGT-002 agent proposals, feature caps) so they charge the real cost.
    const used = await recordCompletion(args, res, Date.now() - start, true, injectionFlags)
    reportAiUsage({ ...used, feature: args.feature })
    if (cacheable && cacheKey && res.ok && (res.text !== undefined || res.json !== undefined)) {
      try {
        const { setCachedCompletion } = await import('@/lib/ai/semantic-cache')
        setCachedCompletion(cacheKey, { ...(res.text !== undefined ? { text: res.text } : {}), ...(res.json !== undefined ? { json: res.json } : {}) }, args.feature)
      } catch {
        // Cache write must never fail the request.
      }
    }
    return res
  } catch (e) {
    void recordCompletion(args, undefined, Date.now() - start, false, injectionFlags)
    throw e
  }
}

export async function backendGet<T = unknown>(
  path: string,
  headers?: HeadersInit
): Promise<T> {
  const h = await backendHeaders()
  const allHeaders = { ...h, ...headers }
  const res = await fetch(`${backendBase()}${path}`, {
    method: 'GET',
    headers: allHeaders,
  })
  if (!res.ok) {
    throw new Error(`backend ${path} returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

/**
 * POST a raw byte stream (application/octet-stream) to an internal backend
 * route, e.g. the streaming virus scan. Only the internal secret is sent (no
 * provider keys). Throws `backend <path> returned <status>: …` like backendPost.
 */
export async function backendPostStream<T = unknown>(
  path: string,
  body: ReadableStream<Uint8Array>,
  opts: { size?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/octet-stream' }
  const internalSecret = await getInternalSecret()
  if (internalSecret) headers['x-internal-secret'] = internalSecret
  if (opts.size !== undefined) headers['Content-Length'] = String(opts.size)
  const res = await fetch(`${backendBase()}${path}`, {
    method: 'POST',
    headers,
    body,
    signal: opts.signal,
    // Node fetch needs half-duplex for a streamed request body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  if (!res.ok) throw new Error(`backend ${path} returned ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

export async function backendPost<T = unknown>(
  path: string,
  body: unknown,
  opts?: { providerOverride?: string; modelOverride?: string; modelRole?: 'reasoning' | 'fast'; endpointOverride?: string; apiKeyOverride?: string; feature?: string; userId?: string },
): Promise<T> {
  const feature = opts?.feature || backendFeatureFor(path)
  if (path.startsWith('/internal/ai/')) await assertAiBudget(feature)
  const headers = await backendHeaders({ apiKeyOverride: opts?.apiKeyOverride })
  const started = Date.now()
  const res = await fetch(`${backendBase()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...(body as object),
      ...(opts?.providerOverride && opts?.modelOverride ? {
        provider_override: opts.providerOverride,
        model_override: opts.modelOverride,
        model_role: opts.modelRole ?? 'reasoning',
        endpoint_override: opts.endpointOverride || '',
      } : {}),
      ...(opts?.apiKeyOverride ? { api_key_override: opts.apiKeyOverride } : {}),
    }),
  })
  await recordHeaderUsage(res, feature, opts?.userId, Date.now() - started)
  if (!res.ok) {
    throw new Error(`backend ${path} returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}
