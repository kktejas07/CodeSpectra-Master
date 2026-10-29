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

// Provider fallback order (priority: free first, then paid).
// ponytail: model IDs verified 2026-09-21 — gemini-2.0-flash 404s, Groq
// llama-3.1-8b-instant 404s, Zen deepseek-v4-flash-free upstream-unavailable
// (prod job logs). Free providers rotate models often — re-check the
// provider /models catalog if the chain starts failing, and keep this in
// sync with PROVIDER_MODELS in lib/courses/lesson-video.ts.
export const PROVIDER_FALLBACK_CHAIN: {
  provider: LLMProviderId
  model: string
  endpoint?: string
  secretKey: string
  free: boolean
}[] = [
  // Free tiers first
  { provider: 'groq', model: 'openai/gpt-oss-120b', endpoint: 'https://api.groq.com/openai/v1', secretKey: 'groq_api_key', free: true },
  { provider: 'groq', model: 'openai/gpt-oss-20b', endpoint: 'https://api.groq.com/openai/v1', secretKey: 'groq_api_key', free: true },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1', secretKey: 'groq_api_key', free: true },
  { provider: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct', endpoint: 'https://integrate.api.nvidia.com/v1', secretKey: 'nvidia_api_key', free: true },
  { provider: 'nvidia', model: 'deepseek-ai/deepseek-v4-flash-0731', endpoint: 'https://integrate.api.nvidia.com/v1', secretKey: 'nvidia_api_key', free: true },
  { provider: 'gemini', model: 'gemini-3-flash-preview', secretKey: 'gemini_api_key', free: true },
  { provider: 'cerebras', model: 'gpt-oss-120b', endpoint: 'https://api.cerebras.ai/v1', secretKey: 'cerebras_api_key', free: true },
  { provider: 'opencode', model: 'mimo-v2.5-free', secretKey: 'opencode_api_key', free: true },
  { provider: 'opencode', model: 'minimax-m3-free', secretKey: 'opencode_api_key', free: true },
  { provider: 'openrouter', model: 'openrouter/auto', secretKey: 'openrouter_api_key', free: true },
  { provider: 'mistral', model: 'mistral-small-latest', endpoint: 'https://api.mistral.ai/v1', secretKey: 'mistral_api_key', free: false },
  // Paid tiers
  { provider: 'deepseek', model: 'deepseek-chat', endpoint: 'https://api.deepseek.com/v1', secretKey: 'deepseek_api_key', free: false },
  { provider: 'openai', model: 'gpt-4o-mini', secretKey: 'openai_api_key', free: false },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', secretKey: 'anthropic_api_key', free: false },
]

// Rate limit detection patterns. NOTE: a rate limit is transient (retry after
// a short wait). Credit/quota exhaustion is NOT — it won't recover by waiting,
// so those are classified as dead below; retrying them just burned the request
// budget (every grade stalled ~30s on the credits-less override model).
const RATE_LIMIT_PATTERNS = [
  /429/i,
  /rate.?limit/i,
  /too.?many.?requests/i,
  /requests.*per.*minute/i,
  /requests.*per.*day/i,
  /API Error \(429\)/i,
  /try again in (\d+)s/i,
]

// Dead provider detection (non-recoverable — skip immediately, no wait)
const DEAD_PROVIDER_PATTERNS = [
  /invalid.*api.*key/i,
  /authentication.*failed/i,
  /unauthorized/i,
  /401/i,
  /invalid.*key/i,
  /key.*not.*found/i,
  /disabled.*account/i,
  /suspended/i,
  // Credit/billing exhaustion and hard quotas — waiting never fixes these.
  /insufficient.?credits/i,
  /exceeded.*quota/i,
  /quota.?exceeded/i,
  /402/i,
  /billing/i,
  /payment.*required/i,
  /no.*credits/i,
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
  /**
   * Batch callers (content backfills, cron) would rather try the next provider
   * than sleep out a 429: with several keys configured, cycling is faster than
   * waiting, and a missed day matters less than a stalled run.
   */
  skipRateLimitWait?: boolean
}

/**
 * Detect if an error response indicates rate limiting
 */
export function isRateLimitError(text: string, status?: number): { isRateLimit: boolean; retryAfterSec?: number } {
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
export function isDeadProvider(text: string, status?: number): boolean {
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

/** Is any LLM provider with a key available right now? (AGT-024: not just OpenAI.) */
export async function hasAnyAiProvider(): Promise<boolean> {
  try {
    return (await getAvailableProviders()).length > 0
  } catch {
    return false
  }
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

  // Custom OpenAI-compatible gateway (Settings → API Keys → Custom gateway).
  // Dynamic on purpose: static entries would trip the provider-chain anti-rot
  // test and probe a possibly-unset endpoint. Joins the chain tail (paid
  // backstop position) only when endpoint + key are both configured.
  try {
    const { getApiKey } = await import('@/lib/ai/get-api-key')
    const customEndpoint = String(secrets.custom_endpoint || process.env.CUSTOM_ENDPOINT || '').trim().replace(/\/+$/, '')
    const customModel =
      String(secrets.custom_model || '').trim() || process.env.CUSTOM_MODEL?.trim() || 'custom'
    if (customEndpoint && /^https?:\/\//.test(customEndpoint)) {
      const customKey = await getApiKey('custom' as any)
      if (customKey?.key) {
        available.push({
          provider: 'custom' as LLMProviderId,
          model: customModel,
          endpoint: customEndpoint,
          apiKey: customKey.key,
          free: false,
        })
      }
    }
  } catch {
    /* custom gateway stays out of the chain — never fail the whole lookup */
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
  // AGT-027: required in production (lib/ai/internal-backend-url), no baked-in host.
  const { internalBackendUrl } = await import('@/lib/ai/internal-backend-url')
  const backend = internalBackendUrl()

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

  // ponytail: honor an explicit caller override FIRST (preferred model), the
  // chain backstops it. Previously overrides were silently ignored here, so
  // every caller walked the same chain head regardless of its preference.
  if (args.providerOverride && args.modelOverride) {
    const { getApiKey } = await import('@/lib/ai/get-api-key')
    const keyResult = args.apiKeyOverride
      ? { key: args.apiKeyOverride }
      : await getApiKey(args.providerOverride as any)
    if (keyResult?.key) {
      providers.unshift({
        provider: args.providerOverride as LLMProviderId,
        model: args.modelOverride,
        endpoint: args.endpointOverride || undefined,
        apiKey: keyResult.key,
        free: false,
      })
      // Dedupe: drop the later chain twin of the explicit request.
      const seen = new Set([`${args.providerOverride}/${args.modelOverride}`])
      for (let i = providers.length - 1; i > 0; i--) {
        const id = `${providers[i].provider}/${providers[i].model}`
        if (seen.has(id)) providers.splice(i, 1)
        else seen.add(id)
      }
    }
  }

  const fallbackPath: string[] = []
  let lastError = ''
  let totalRetries = 0
  const MAX_RETRIES = 3
  // ponytail: walk the WHOLE keyed chain, not just the first 8 — with 10+
  // providers configured the tail (paid backstops) must still be reachable.
  const MAX_PROVIDER_ATTEMPTS = providers.length

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

        // Batch work moves on immediately; interactive calls wait it out.
        if (args.skipRateLimitWait) {
          console.log(`[provider-fallback] skipping ${providerModel} (batch mode) — trying the next provider`)
          continue
        }

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
  let answered: { provider?: string; model?: string } = {}

  try {
    const result = await providerFallbackComplete(args)
    parsedRes = result.json
    answered = { provider: result.provider, model: result.model }
    return {
      ok: true,
      json: result.json,
      text: result.text,
      raw: result.raw,
      provider: result.provider,
      model: result.model,
      ...(result.usage ? { usage: result.usage } : {}),
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
          // AGT-026: attribute cost to the model that actually answered (a fallback may have).
          const model = answered.model || parsedRes?.model || args.modelOverride || 'unknown'
          const provider = answered.provider || parsedRes?.provider || args.providerOverride || 'unknown'
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
