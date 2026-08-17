/**
 * Thin client wrapper that calls the FastAPI backend's internal AI router.
 *
 * Backend is reachable in-cluster at http://localhost:8001 (set via
 * INTERNAL_BACKEND_URL env, defaults to localhost:8001). These calls happen
 * ONLY server-side from Next.js API route handlers — never expose this from
 * the browser.
 */

const BACKEND = process.env.INTERNAL_BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'http://codespectra-backend-cd7lq6:8000' : 'http://localhost:8001')

async function getBackendSecrets(): Promise<{
  anthropic: string; gemini: string; openai: string; openrouter: string; opencode: string; groq: string
}> {
  const fromEnv = {
    anthropic: process.env.ANTHROPIC_API_KEY?.trim() || '',
    gemini: process.env.GEMINI_API_KEY?.trim() || '',
    openai: process.env.OPENAI_API_KEY?.trim() || '',
    openrouter: process.env.OPENROUTER_API_KEY?.trim() || '',
    opencode: process.env.OPENCODE_API_KEY?.trim() || '',
    groq: process.env.GROQ_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || '',
  }
  try {
    const { readServerSecrets, isMaskedSecret } = await import('@/lib/server-secrets-cache')
    const { readPlatformLlmConfig } = await import('@/lib/ai/get-user-model')
    const [secrets, platformLlm] = await Promise.all([readServerSecrets(), readPlatformLlmConfig()])
    const llmKey = platformLlm?.api_key && typeof platformLlm.api_key === 'string' && !isMaskedSecret(platformLlm.api_key) ? platformLlm.api_key.trim() : ''
    return {
      anthropic: fromEnv.anthropic || (secrets.anthropic_api_key?.trim() || llmKey),
      gemini: fromEnv.gemini || (secrets.gemini_api_key?.trim() || llmKey),
      openai: fromEnv.openai || (secrets.openai_api_key?.trim() || llmKey),
      openrouter: fromEnv.openrouter || (secrets.openrouter_api_key?.trim() || llmKey),
      opencode: fromEnv.opencode || (secrets.opencode_api_key?.trim() || llmKey),
      groq: fromEnv.groq || (secrets.groq_api_key?.trim() || llmKey),
    }
  } catch {
    return fromEnv
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
}): Promise<{ ok: boolean; text?: string; json?: unknown; raw?: string }> {
  const headers = await backendHeaders({ apiKeyOverride: args.apiKeyOverride })
  const res = await fetch(`${BACKEND}/internal/ai/complete`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      session_id: args.sessionId ?? 'default',
      system_message: args.systemMessage,
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'fast',
      response_format: args.responseFormat ?? 'text',
      ...(args.providerOverride && args.modelOverride ? {
        provider_override: args.providerOverride,
        model_override: args.modelOverride,
        endpoint_override: args.endpointOverride || '',
      } : {}),
      ...(args.apiKeyOverride ? { api_key_override: args.apiKeyOverride } : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    return { ok: false, text }
  }
  return (await res.json()) as { ok: boolean; text?: string; json?: unknown; raw?: string }
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

/**
 * Wraps backendPost with AI usage tracking (latency, tokens, cost).
 * Call this from AI route handlers to automatically log usage.
 */
export async function trackedBackendPost<T = unknown>(
  path: string,
  body: unknown,
  opts: { feature: string; userId?: string; providerOverride?: string; modelOverride?: string; modelRole?: 'reasoning' | 'fast'; endpointOverride?: string; apiKeyOverride?: string },
): Promise<T> {
  const start = Date.now()
  let success = true
  let error: string | undefined
  let result: T

  try {
    result = await backendPost<T>(path, body, opts)
  } catch (e) {
    success = false
    error = e instanceof Error ? e.message : 'Unknown error'
    throw e
  } finally {
    const latencyMs = Date.now() - start

    // Fire-and-forget: log usage to analytics (don't block the response)
    import('@/lib/db/analytics').then(async ({ analyticsAiUsage, estimateAiCost, newId, nowIso }) => {
      try {
        // Try to extract token info from response
        const res = result as any
        const inputTokens = res?.usage?.input_tokens || res?.prompt_tokens || 0
        const outputTokens = res?.usage?.output_tokens || res?.completion_tokens || 0
        const model = opts.modelOverride || 'unknown'
        const provider = opts.providerOverride || 'unknown'
        const totalTokens = inputTokens + outputTokens
        const cost = estimateAiCost(model, inputTokens, outputTokens)

        const col = await analyticsAiUsage()
        await col.insertOne({
          id: newId(),
          user_id: opts.userId,
          feature: opts.feature,
          provider,
          model,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          estimated_cost: cost,
          latency_ms: latencyMs,
          success,
          error,
          timestamp: nowIso(),
        } as any)
      } catch {
        // Silent — analytics should never break AI
      }
    }).catch(() => null)
  }

  return result!
}
