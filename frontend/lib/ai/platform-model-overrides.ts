import { readPlatformLlmConfig } from '@/lib/ai/get-user-model'
import { readServerSecrets, isMaskedSecret } from '@/lib/server-secrets-cache'
import { LLM_PROVIDERS } from '@/lib/llm-config'

/** Map a free-form provider name to a backend enum the AI router understands. */
function normalizeProvider(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower === 'opencode' || lower === 'omnirouter') return 'opencode'
  if (lower === 'openrouter') return 'openrouter'
  if (lower === 'gemini') return 'gemini'
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai') return 'openai'
  return lower // groq, deepseek, nvidia, etc. pass through
}

/**
 * Provider → secrets field name mapping for API key fallback.
 * When the LLM config's api_key is empty/masked, we read the provider-specific
 * key from the secrets document as a fallback.
 */
const PROVIDER_SECRETS_MAP: Record<string, string> = {
  openrouter: 'openrouter_api_key',
  opencode: 'opencode_api_key',
  omnirouter: 'openrouter_api_key',
  openai: 'openai_api_key',
  anthropic: 'anthropic_api_key',
  gemini: 'gemini_api_key',
  groq: 'groq_api_key',
  nvidia: 'nvidia_api_key',
}

/**
 * Honor the Superadmin LLM config (Settings → AI & LLM Provider) so the
 * configured model/provider is used instead of the backend's hard-coded
 * default (fast → gemini). Falls back to secrets key when LLM config api_key
 * is empty.
 */
export async function platformModelOverrides(): Promise<{
  providerOverride?: string
  modelOverride?: string
  endpointOverride?: string
  apiKeyOverride?: string
}> {
  try {
    const cfg = await readPlatformLlmConfig()
    if (!cfg) return {}
    const provider = normalizeProvider(cfg.provider || '')
    if (!provider) return {}

    // ponytail: validate the model actually exists in the known provider
    // list.  Dead/renamed models (groq:llama-3.1-8b-instant, old gemini
    // names) would get prepended to every chain and burn one failed attempt
    // per lesson — 72 lessons × 1 wasted call = 72 pointless 404s before
    // the fallback chain even starts.  Return no override so the standard
    // chain (which has verified-live models) takes over.
    const providerDef = LLM_PROVIDERS.find(p => p.id === provider)
    if (!providerDef || !providerDef.models.includes(cfg.model || '')) {
      console.log(`[platform-model-overrides] skipping dead model ${provider}:${cfg.model} — not in known list`)
      return {}
    }

    let apiKey = cfg.api_key && typeof cfg.api_key === 'string' && !isMaskedSecret(cfg.api_key)
      ? cfg.api_key.trim()
      : ''

    // Fallback: read provider-specific key from secrets when LLM config key is empty
    if (!apiKey) {
      const secretsField = PROVIDER_SECRETS_MAP[provider]
      if (secretsField) {
        const secrets = await readServerSecrets()
        const fallbackKey = (secrets as Record<string, unknown>)[secretsField]
        if (typeof fallbackKey === 'string' && !isMaskedSecret(fallbackKey) && fallbackKey.trim()) {
          apiKey = fallbackKey.trim()
        }
      }
    }

    return {
      providerOverride: provider,
      modelOverride: cfg.model,
      ...(cfg.endpoint ? { endpointOverride: cfg.endpoint } : {}),
      ...(apiKey ? { apiKeyOverride: apiKey } : {}),
    }
  } catch {
    return {}
  }
}
