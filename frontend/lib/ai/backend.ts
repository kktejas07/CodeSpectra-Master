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

const PROD_BACKEND = 'http://codespectra-backend-cd7lq6:8000'
const BACKEND = process.env.INTERNAL_BACKEND_URL
  || ((process.env.COURSE_WORKER === '1' || process.env.NODE_ENV === 'production')
    ? PROD_BACKEND
    : 'http://localhost:8001')

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
  const res = await fetch(`${BACKEND}/internal/ai/chat`, {
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
function extractUsageTokens(res: unknown): { promptTokens?: number; completionTokens?: number } {
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
    return { ...(promptTokens !== undefined ? { promptTokens } : {}), ...(completionTokens !== undefined ? { completionTokens } : {}) }
  } catch {
    return {}
  }
}

/**
 * Phase-3 usage telemetry: fire-and-forget, never awaited, never throws.
 * Injection flags are LOG-ONLY — the request always proceeds.
 */
function fireAndForgetUsage(
  args: { feature?: string; userId?: string; providerOverride?: string; modelOverride?: string },
  res: { provider?: string; model?: string } | undefined,
  latencyMs: number,
  ok: boolean,
  injectionFlags: string[],
): void {
  try {
    const tokens = extractUsageTokens(res)
    const entry = {
      userId: args.userId,
      feature: args.feature || 'unknown',
      provider: res?.provider || args.providerOverride || 'unknown',
      model: res?.model || args.modelOverride || 'unknown',
      ...(tokens.promptTokens !== undefined ? { promptTokens: tokens.promptTokens } : {}),
      ...(tokens.completionTokens !== undefined ? { completionTokens: tokens.completionTokens } : {}),
      latencyMs,
      ok,
      injectionFlags,
    }
    void import('@/lib/ai/cost-tracking').then(
      ({ logAiUsage }) => logAiUsage(entry),
      () => undefined,
    )
  } catch {
    // Telemetry must never fail the request.
  }
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
}): Promise<{ ok: boolean; text?: string; json?: unknown; raw?: string; usage?: { input_tokens: number, output_tokens: number } }> {
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
        fireAndForgetUsage({ ...args, feature: (args.feature || 'unknown') + ':cache-hit' }, undefined, Date.now() - start, true, injectionFlags)
        return { ok: true, ...(hit.text !== undefined ? { text: hit.text } : {}), ...(hit.json !== undefined ? { json: hit.json } : {}) }
      }
    } catch {
      cacheKey = ''
    }
  }
  // Use OmniRouter-style provider fallback for automatic failover
  const { backendCompleteWithFallback } = await import('@/lib/ai/provider-fallback')
  try {
    const res = await backendCompleteWithFallback(args)
    fireAndForgetUsage(args, res, Date.now() - start, true, injectionFlags)
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
    fireAndForgetUsage(args, undefined, Date.now() - start, false, injectionFlags)
    throw e
  }
}

export async function backendGet<T = unknown>(
  path: string,
  headers?: HeadersInit
): Promise<T> {
  const h = await backendHeaders()
  const allHeaders = { ...h, ...headers }
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'GET',
    headers: allHeaders,
  })
  if (!res.ok) {
    throw new Error(`backend ${path} returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}

export async function backendPost<T = unknown>(
  path: string,
  body: unknown,
  opts?: { providerOverride?: string; modelOverride?: string; modelRole?: 'reasoning' | 'fast'; endpointOverride?: string; apiKeyOverride?: string },
): Promise<T> {
  const headers = await backendHeaders({ apiKeyOverride: opts?.apiKeyOverride })
  const res = await fetch(`${BACKEND}${path}`, {
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
  if (!res.ok) {
    throw new Error(`backend ${path} returned ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as T
}
