/**
 * OmniRouter-style provider fallback system.
 *
 * When a provider hits rate limits (429), quota exhaustion, or errors,
 * this system automatically:
 * 1. Marks the key as rate-limited
 * 2. Rotates to the next available key/provider
 * 3. Retries with exponential backoff
 * 4. Falls back through a chain of providers
 *
 * Similar to OmniRouter / 9Router proxy behavior.
 */

import { getMongoDb } from '@/lib/mongodb'
import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'
import { type LLMProviderId } from '@/lib/llm-config'
import { markKeyRateLimited, getRoundRobinKey } from '@/lib/ai/get-round-robin-key'

// Provider fallback order (priority: free first, then paid)
const PROVIDER_FALLBACK_CHAIN: {
  provider: LLMProviderId
  model: string
  endpoint?: string
  secretKey: string
  free: boolean
}[] = [
  // Free tiers first (models verified live 2026-09-06; free providers rotate
  // models often — re-check GET /models if the chain starts failing)
  { provider: 'groq', model: 'openai/gpt-oss-120b', endpoint: 'https://api.groq.com/openai/v1', secretKey: 'groq_api_key', free: true },
  { provider: 'groq', model: 'openai/gpt-oss-20b', endpoint: 'https://api.groq.com/openai/v1', secretKey: 'groq_api_key', free: true },
  { provider: 'gemini', model: 'gemini-2.0-flash', secretKey: 'gemini_api_key', free: true },
  { provider: 'opencode', model: 'deepseek-v4-flash-free', secretKey: 'opencode_api_key', free: true },
  { provider: 'openrouter', model: 'google/gemini-2.0-flash-lite-001:free', secretKey: 'openrouter_api_key', free: true },
  // Paid tiers
  { provider: 'openai', model: 'gpt-4o-mini', secretKey: 'openai_api_key', free: false },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', secretKey: 'anthropic_api_key', free: false },
  { provider: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct', endpoint: 'https://integrate.api.nvidia.com/v1', secretKey: 'nvidia_api_key', free: false },
  { provider: 'deepseek', model: 'deepseek-chat', secretKey: 'deepseek_api_key', free: false },
  { provider: 'gemini', model: 'gemini-2.0-flash-lite', secretKey: 'gemini_api_key', free: true },
]

// Rate limit detection patterns
const RATE_LIMIT_PATTERNS = [
  /429/i,
  /rate.?limit/i,
  /quota.?exceeded/i,
  /insufficient.?credits/i,
  /too.?many.?requests/i,
  /requests.*per.*minute/i,
  /requests.*per.*day/i,
  /exceeded.*quota/i,
  /API Error \(429\)/i,
  /try again in (\d+)s/i,
]

// Dead provider detection (non-recoverable errors)
const DEAD_PROVIDER_PATTERNS = [
  /invalid.*api.*key/i,
  /authentication.*failed/i,
  /unauthorized/i,
  /401/i,
  /invalid.*key/i,
  /key.*not.*found/i,
  /disabled.*account/i,
  /suspended/i,
]

interface FallbackResult {
  ok: boolean
  text?: string
  json?: unknown
  raw?: string
  provider?: string
  model?: string
  usage?: { input_tokens: number; output_tokens: number }
  retries?: number
  fallbackPath?: string[]
}

interface BackendCompleteArgs {
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
}

/**
 * Detect if an error response indicates rate limiting
 */
function isRateLimitError(text: string, status?: number): { isRateLimit: boolean; retryAfterSec?: number } {
  if (status === 429) {
    const match = text.match(/try again in (\d+)s/i)
    return { isRateLimit: true, retryAfterSec: match ? parseInt(match[1]) : 60 }
  }
  for (const pattern of RATE_LIMIT_PATTERNS) {
    if (pattern.test(text)) {
      const match = text.match(/try again in (\d+)s/i)
      return { isRateLimit: true, retryAfterSec: match ? parseInt(match[1]) : 60 }
    }
  }
  return { isRateLimit: false }
}

/**
 * Detect if an error is non-recoverable (dead provider)
 */
function isDeadProvider(text: string, status?: number): boolean {
  if (status === 401 || status === 403) return true
  for (const pattern of DEAD_PROVIDER_PATTERNS) {
    if (pattern.test(text)) return true
  }
  return false
}

/**
 * Extract error message from response
 */
function extractError(res: { ok?: boolean; text?: string; json?: unknown; raw?: string }): string {
  if (typeof res.text === 'string' && res.text.trim()) return res.text.trim().slice(0, 200)
  if (typeof res.raw === 'string' && res.raw.trim()) return res.raw.trim().slice(0, 200)
  if (res.json && typeof res.json === 'object' && 'error' in res.json) {
    return String((res.json as any).error).slice(0, 200)
  }
  return 'request failed'
}

/**
 * Get all available providers with their keys, respecting rate limits
 */
async function getAvailableProviders(): Promise<{
  provider: LLMProviderId
  model: string
  endpoint?: string
  apiKey: string
  free: boolean
}[]> {
  const secrets = await readServerSecrets() as Record<string, unknown>
  const db = await getMongoDb()
  const llmDoc = await db.collection('platform_settings').findOne({ key: 'llm' })
  const llmConfig = llmDoc?.value as any
  const now = Date.now()

  const available: {
    provider: LLMProviderId
    model: string
    endpoint?: string
    apiKey: string
    free: boolean
  }[] = []

  for (const entry of PROVIDER_FALLBACK_CHAIN) {
    // Get key using the unified getApiKey utility
    const { getApiKey } = await import('@/lib/ai/get-api-key')
    const keyResult = await getApiKey(entry.provider as any)
    
    if (!keyResult) continue

    // Skip if all keys for this provider are rate-limited
    if (llmConfig?.keys?.[entry.provider]?.length > 0) {
      const keys = llmConfig.keys[entry.provider] as any[]
      const activeKeys = keys.filter((k: any) => !k.rate_limited_until || k.rate_limited_until < now)
      if (activeKeys.length === 0) {
        console.log(`[provider-fallback] all keys for ${entry.provider} are rate-limited, skipping`)
        continue
      }
    }

    available.push({
      provider: entry.provider,
      model: entry.model,
      endpoint: entry.endpoint,
      apiKey: keyResult.key,
      free: entry.free,
    })
  }

  return available
}

/**
 * Make a single backend request with specific provider/key
 */
async function makeRequest(
  args: BackendCompleteArgs,
  provider: string,
  model: string,
  endpoint: string | undefined,
  apiKey: string,
  internalSecret: string,
  backend: string,
): Promise<{ ok: boolean; text?: string; json?: unknown; raw?: string; status?: number }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (internalSecret) headers['x-internal-secret'] = internalSecret
  headers['x-api-key'] = apiKey
  headers['x-openai-api-key'] = apiKey
  headers['x-gemini-api-key'] = apiKey
  headers['x-anthropic-api-key'] = apiKey

  const res = await fetch(`${backend}/internal/ai/complete`, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      session_id: args.sessionId ?? 'default',
      system_message: args.systemMessage,
      user_message: args.userMessage,
      model_role: args.modelRole ?? 'fast',
      response_format: args.responseFormat ?? 'text',
      provider_override: provider,
      model_override: model,
      endpoint_override: endpoint || '',
      api_key_override: apiKey,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    return { ok: false, text, status: res.status }
  }

  const json = await res.json()
  return { ok: true, json }
}

/**
 * OmniRouter-style fallback: tries providers in order, handles rate limits,
 * marks rate-limited keys, and retries with backoff.
 */
export async function providerFallbackComplete(args: BackendCompleteArgs): Promise<FallbackResult> {
  const PROD_BACKEND = 'http://codespectra-backend-cd7lq6:8000'
  const backend = process.env.INTERNAL_BACKEND_URL
    || ((process.env.COURSE_WORKER === '1' || process.env.NODE_ENV === 'production')
      ? PROD_BACKEND
      : 'http://localhost:8001')

  // Get internal secret
  let internalSecret = process.env.INTERNAL_BACKEND_SECRET?.trim() || ''
  if (!internalSecret) {
    try {
      const secrets = await readServerSecrets() as Record<string, unknown>
      const stored = typeof secrets.internal_backend_secret === 'string' ? secrets.internal_backend_secret.trim() : ''
      if (stored && !isMaskedSecret(stored)) internalSecret = stored
    } catch {}
  }

  // Get available providers
  const providers = await getAvailableProviders()
  if (providers.length === 0) {
    throw new Error('No LLM provider with a configured API key is available')
  }

  const fallbackPath: string[] = []
  let lastError = ''
  let totalRetries = 0
  const MAX_RETRIES = 3
  const MAX_PROVIDER_ATTEMPTS = Math.min(providers.length, 8)

  for (let i = 0; i < MAX_PROVIDER_ATTEMPTS; i++) {
    const p = providers[i % providers.length]
    const providerModel = `${p.provider}/${p.model}`
    fallbackPath.push(providerModel)

    console.log(`[provider-fallback] trying ${providerModel}`)

    try {
      const res = await makeRequest(args, p.provider, p.model, p.endpoint, p.apiKey, internalSecret, backend)

      if (res.ok) {
        console.log(`[provider-fallback] success with ${providerModel}`)
        return {
          ok: true,
          json: res.json,
          text: res.text,
          raw: res.raw,
          provider: p.provider,
          model: p.model,
          retries: totalRetries,
          fallbackPath,
        }
      }

      const errorText = res.text || ''
      lastError = `${providerModel}: ${errorText.slice(0, 150)}`

      // Check if rate limited
      const { isRateLimit, retryAfterSec } = isRateLimitError(errorText, res.status)
      if (isRateLimit) {
        console.log(`[provider-fallback] rate limited on ${providerModel}, retry after ${retryAfterSec}s`)

        // Mark key as rate-limited in DB
        await markKeyRateLimited(p.provider, p.apiKey, (retryAfterSec || 60) * 1000)

        // Wait and retry same provider once
        if (totalRetries < MAX_RETRIES) {
          totalRetries++
          const waitMs = Math.min((retryAfterSec || 60) * 1000, 30_000) // Cap at 30s
          console.log(`[provider-fallback] waiting ${waitMs}ms before retry`)
          await new Promise(r => setTimeout(r, waitMs))
          i-- // Retry same provider
          continue
        }
      }

      // Check if dead provider (don't retry)
      if (isDeadProvider(errorText, res.status)) {
        console.log(`[provider-fallback] dead provider ${providerModel}, moving to next`)
        continue
      }

      // Other error - try next provider
      console.log(`[provider-fallback] error on ${providerModel}: ${errorText.slice(0, 100)}`)
    } catch (e) {
      lastError = `${providerModel}: ${e instanceof Error ? e.message : String(e)}`
      console.log(`[provider-fallback] exception on ${providerModel}: ${lastError}`)
    }
  }

  throw new Error(`All LLM providers failed (${totalRetries} retries). Last: ${lastError}`)
}

/**
 * Enhanced backendComplete with automatic provider fallback.
 * Drop-in replacement for the original backendComplete in backend.ts.
 */
export async function backendCompleteWithFallback(args: BackendCompleteArgs): Promise<{
  ok: boolean
  text?: string
  json?: unknown
  raw?: string
  usage?: { input_tokens: number; output_tokens: number }
  provider?: string
  model?: string
}> {
  const start = Date.now()
  let success = true
  let error: string | undefined
  let parsedRes: any

  try {
    const result = await providerFallbackComplete(args)
    parsedRes = result.json
    return {
      ok: true,
      json: result.json,
      text: result.text,
      raw: result.raw,
      provider: result.provider,
      model: result.model,
    }
  } catch (e) {
    success = false
    error = e instanceof Error ? e.message : 'Unknown error'
    throw e
  } finally {
    const latencyMs = Date.now() - start
    if (args.feature) {
      import('@/lib/db/analytics').then(async ({ analyticsAiUsage, estimateAiCost, newId, nowIso }) => {
        try {
          const inputTokens = parsedRes?.usage?.input_tokens || parsedRes?.prompt_tokens || 0
          const outputTokens = parsedRes?.usage?.output_tokens || parsedRes?.completion_tokens || 0
          const model = args.modelOverride || parsedRes?.model || 'unknown'
          const provider = args.providerOverride || parsedRes?.provider || 'unknown'
          const totalTokens = inputTokens + outputTokens
          const cost = estimateAiCost(model, inputTokens, outputTokens)

          const col = await analyticsAiUsage()
          await col.insertOne({
            id: newId(),
            user_id: args.userId,
            feature: args.feature,
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
        } catch {}
      }).catch(() => null)
    }
  }
}
