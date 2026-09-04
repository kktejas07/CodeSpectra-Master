/**
 * Unified API key resolution with round-robin support.
 *
 * This is the single source of truth for getting API keys across the entire project.
 * All routes should use this instead of hardcoding provider keys.
 *
 * Features:
 * - Reads from superadmin-configured keys (platform_settings.secrets)
 * - Supports multiple keys per provider (comma-separated)
 * - Round-robin selection across multiple keys
 * - Rate-limit detection and automatic rotation
 * - Fallback to environment variables
 * - Usage tracking integration
 */

import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'
import { getRoundRobinKey, markKeyRateLimited } from '@/lib/ai/get-round-robin-key'
import { readPlatformLlmConfig } from '@/lib/ai/get-user-model'

export type ProviderId =
  | 'gemini' | 'opencode' | 'groq' | 'openrouter' | 'openai'
  | 'anthropic' | 'nvidia' | 'deepseek' | 'cerebras' | 'mistral'
  | 'cohere' | 'fireworks' | 'xai' | 'replicate' | 'elevenlabs'
  | 'assemblyai' | 'deepgram' | 'deepinfra' | 'novita' | 'stability'
  | 'fal' | 'ai21' | 'kimi' | 'lemonfox' | 'huggingface'
  | 'cloudflare_workers' | 'sambanova' | 'nscale' | 'chutes'
  | 'modelscope' | 'langchain' | 'langfuse' | 'pinecone' | 'qdrant'
  | 'tavily' | 'firecrawl' | 'serper' | 'jina' | 'exa'
  | 'notion' | 'slack' | 'google_knowledge' | 'browserbase'
  | 'brightdata' | 'scrapingbee'

// Map provider names to secret key field names
const PROVIDER_SECRET_MAP: Record<ProviderId, string> = {
  gemini: 'gemini_api_key',
  opencode: 'opencode_api_key',
  groq: 'groq_api_key',
  openrouter: 'openrouter_api_key',
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  nvidia: 'nvidia_api_key',
  deepseek: 'deepseek_api_key',
  cerebras: 'cerebras_api_key',
  mistral: 'mistral_api_key',
  cohere: 'cohere_api_key',
  fireworks: 'fireworks_api_key',
  xai: 'xai_api_key',
  replicate: 'replicate_api_key',
  elevenlabs: 'elevenlabs_api_key',
  assemblyai: 'assemblyai_api_key',
  deepgram: 'deepgram_api_key',
  deepinfra: 'deepinfra_api_key',
  novita: 'novita_api_key',
  stability: 'stability_api_key',
  fal: 'fal_api_key',
  ai21: 'ai21_api_key',
  kimi: 'kimi_api_key',
  lemonfox: 'lemonfox_api_key',
  huggingface: 'huggingface_api_key',
  cloudflare_workers: 'cloudflare_workers_api_key',
  sambanova: 'sambanova_api_key',
  nscale: 'nscale_api_key',
  chutes: 'chutes_api_key',
  modelscope: 'modelscope_api_key',
  langchain: 'langchain_api_key',
  langfuse: 'langfuse_api_key',
  pinecone: 'pinecone_api_key',
  qdrant: 'qdrant_api_key',
  tavily: 'tavily_api_key',
  firecrawl: 'firecrawl_api_key',
  serper: 'serper_api_key',
  jina: 'jina_api_key',
  exa: 'exa_api_key',
  notion: 'notion_api_key',
  slack: 'slack_api_key',
  google_knowledge: 'google_knowledge_graph_api_key',
  browserbase: 'browserbase_api_key',
  brightdata: 'brightdata_api_key',
  scrapingbee: 'scrapingbee_api_key',
}

// Environment variable names for each provider
const PROVIDER_ENV_MAP: Partial<Record<ProviderId, string>> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
}

interface ApiKeyResult {
  key: string
  provider: ProviderId
  source: 'round-robin' | 'secret' | 'env' | 'llm-config'
}

// Track round-robin index per provider for comma-separated keys
const roundRobinIndex = new Map<ProviderId, number>()

/**
 * Get an API key for a specific provider with round-robin support.
 *
 * Priority order:
 * 1. Round-robin key from LLM config (multiple keys per provider)
 * 2. Round-robin across comma-separated keys from server secrets
 * 3. Single key from server secrets (platform_settings.secrets)
 * 4. Environment variable
 *
 * @param provider - The provider to get a key for
 * @returns The API key and metadata, or null if no key is configured
 */
export async function getApiKey(provider: ProviderId): Promise<ApiKeyResult | null> {
  try {
    // 1. Try round-robin key from LLM config
    const rrKey = await getRoundRobinKey(provider)
    if (rrKey) {
      return { key: rrKey, provider, source: 'round-robin' }
    }

    // 2. Try comma-separated keys from server secrets
    const secrets = await readServerSecrets()
    const secretField = PROVIDER_SECRET_MAP[provider]
    const secretValue = secrets[secretField as keyof typeof secrets]
    if (typeof secretValue === 'string' && secretValue.trim() && !isMaskedSecret(secretValue)) {
      // Check if multiple keys (comma-separated)
      const keys = secretValue.split(',').map(k => k.trim()).filter(Boolean)
      if (keys.length > 1) {
        // Round-robin across multiple keys
        const idx = roundRobinIndex.get(provider) || 0
        const selectedIdx = idx % keys.length
        roundRobinIndex.set(provider, selectedIdx + 1)
        return { key: keys[selectedIdx], provider, source: 'secret' }
      }
      // Single key
      return { key: keys[0], provider, source: 'secret' }
    }

    // 3. Try environment variable
    const envKey = PROVIDER_ENV_MAP[provider]
    if (envKey) {
      const envValue = process.env[envKey]?.trim()
      if (envValue) {
        return { key: envValue, provider, source: 'env' }
      }
    }

    return null
  } catch (e) {
    console.error(`[get-api-key] Error getting key for ${provider}:`, e)
    return null
  }
}

/**
 * Track AI usage event. Call this after every AI API call to log usage.
 * This is a convenience wrapper around the analytics module.
 */
export async function trackAiUsage(event: {
  user_id?: string
  feature: string
  provider: string
  model: string
  input_tokens?: number
  output_tokens?: number
  latency_ms?: number
  success: boolean
  error?: string
}): Promise<void> {
  try {
    const { trackAiUsage: trackUsage } = await import('@/lib/db/analytics')
    const inputTokens = event.input_tokens || 0
    const outputTokens = event.output_tokens || 0
    const { estimateAiCost } = await import('@/lib/db/analytics')
    const cost = estimateAiCost(event.model, inputTokens, outputTokens)

    await trackUsage({
      user_id: event.user_id,
      feature: event.feature,
      provider: event.provider,
      model: event.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
      estimated_cost: cost,
      latency_ms: event.latency_ms || 0,
      success: event.success,
      error: event.error,
    })
  } catch (e) {
    console.error('[get-api-key] Failed to track usage:', e)
  }
}

/**
 * Get an API key for a provider from a list of fallback providers.
 * Tries each provider in order until one with a key is found.
 *
 * @param providers - List of providers to try in order
 * @returns The first available API key, or null if none found
 */
export async function getApiKeyWithFallback(
  providers: ProviderId[]
): Promise<ApiKeyResult | null> {
  for (const provider of providers) {
    const result = await getApiKey(provider)
    if (result) return result
  }
  return null
}

/**
 * Mark a provider's key as rate-limited.
 * Called when a 429 or quota error is received.
 *
 * @param provider - The provider that was rate-limited
 * @param key - The specific key that was rate-limited (optional, defaults to current key)
 * @param delayMs - How long to wait before trying again (default: 60 seconds)
 */
export async function markRateLimited(
  provider: ProviderId,
  key?: string,
  delayMs: number = 60000
): Promise<void> {
  await markKeyRateLimited(provider, key || '', delayMs)
}

/**
 * Get all configured providers with their keys.
 * Useful for admin dashboards and debugging.
 *
 * @returns Map of provider to key status
 */
export async function getAllProviderKeys(): Promise<Map<ProviderId, { configured: boolean; source: string }>> {
  const result = new Map<ProviderId, { configured: boolean; source: string }>()
  const secrets = await readServerSecrets()

  for (const [provider, secretField] of Object.entries(PROVIDER_SECRET_MAP)) {
    const pid = provider as ProviderId
    const secretValue = secrets[secretField as keyof typeof secrets]
    const envKey = PROVIDER_ENV_MAP[pid]
    const envValue = envKey ? process.env[envKey] : undefined

    const hasSecret = typeof secretValue === 'string' && secretValue.trim() && !isMaskedSecret(secretValue)
    const hasEnv = !!envValue?.trim()

    result.set(pid, {
      configured: hasSecret || hasEnv,
      source: hasSecret ? 'secret' : hasEnv ? 'env' : 'none',
    })
  }

  return result
}

/**
 * Normalize a provider name string to a ProviderId.
 * Handles various formats like "Google Gemini", "openai", "OpenAI", etc.
 */
export function normalizeProvider(name: string): ProviderId | null {
  const lower = name.toLowerCase().trim()
  
  // Direct matches
  if (lower in PROVIDER_SECRET_MAP) return lower as ProviderId
  
  // Common aliases
  const aliases: Record<string, ProviderId> = {
    'google gemini': 'gemini',
    'google': 'gemini',
    'open ai': 'openai',
    'anthropic claude': 'anthropic',
    'claude': 'anthropic',
    'nvidia nim': 'nvidia',
    'deep seek': 'deepseek',
    'xai (grok)': 'xai',
    'grok': 'xai',
    'eleven labs': 'elevenlabs',
    'hugging face': 'huggingface',
    'cloudflare workers ai': 'cloudflare_workers',
    'cloudflare': 'cloudflare_workers',
    'stability ai': 'stability',
    'fal.ai': 'fal',
    'kimi (moonshot)': 'kimi',
    'moonshot': 'kimi',
    'google knowledge graph': 'google_knowledge',
    'bright data': 'brightdata',
    'jina ai': 'jina',
  }
  
  return aliases[lower] || null
}
