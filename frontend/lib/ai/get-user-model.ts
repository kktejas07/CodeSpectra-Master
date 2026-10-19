import { getMongoDb } from '@/lib/mongodb'
import { MODEL_OPTIONS, type UserAISettings } from '@/lib/ai/model-options'
import { type LLMConfig, LLM_PROVIDERS } from '@/lib/llm-config'

type ModelPrefKey = keyof UserAISettings
type ModelResult = { providerOverride: string; modelOverride: string; modelRole: 'reasoning' | 'fast'; endpointOverride?: string; apiKeyOverride?: string }

// In-memory TTL cache — user model preferences change rarely.
const _cache = new Map<string, { value: ModelResult; expires: number }>()
const CACHE_TTL_MS = 60_000

/** Map a free-form provider name to a backend enum the AI router understands. */
function normalizeProvider(provider: string): string {
  const lower = provider.toLowerCase()
  if (lower === 'opencode' || lower === 'omnirouter') return 'opencode'
  if (lower === 'openrouter') return 'openrouter'
  if (lower === 'gemini') return 'gemini'
  if (lower === 'anthropic') return 'anthropic'
  if (lower === 'openai') return 'openai'
  return lower
}

/** Read the global LLM config from platform_settings. Returns null if not configured. */
export async function readPlatformLlmConfig(): Promise<LLMConfig | null> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'llm' })
    if (!doc?.value) return null
    const cfg = doc.value as unknown as LLMConfig
    if (!cfg.provider || !cfg.model) return null
    // Skip if provider was explicitly cleared
    if (LLM_PROVIDERS.every(p => p.id !== cfg.provider)) return null
    return cfg
  } catch {
    return null
  }
}

async function resolveModelInner(userId: string, feature: ModelPrefKey): ReturnType<typeof resolveModel> {
  const result: ModelResult = { providerOverride: '', modelOverride: '', modelRole: 'reasoning' }

  // 1. Check global LLM config first (superadmin-set)
  try {
    const platformCfg = await readPlatformLlmConfig()
    if (platformCfg) {
      const override = platformCfg.taskOverrides?.[feature]
      if (override?.provider && override?.model) {
        result.providerOverride = normalizeProvider(override.provider)
        result.modelOverride = override.model
        if (override.endpoint) result.endpointOverride = override.endpoint
      } else {
        result.providerOverride = normalizeProvider(platformCfg.provider)
        result.modelOverride = platformCfg.model
        if (platformCfg.endpoint) {
          result.endpointOverride = platformCfg.endpoint
        }
      }
      
      // All features use the same single model now, default to 'reasoning' role
      result.modelRole = 'reasoning'
      
      // The legacy single api_key belongs to platformCfg.provider only — a
      // per-task override on another provider must not receive it (same rule
      // as getRoundRobinKey); that provider's own keys/secrets/env apply.
      const { legacyKeyFor } = await import('@/lib/ai/get-round-robin-key')
      const legacy = legacyKeyFor(platformCfg, result.providerOverride as never)
      if (legacy) result.apiKeyOverride = legacy
      return result
    }
  } catch { /* fall through to user settings */ }

  // 2. Fall back to per-user model preference
  try {
    const db = await getMongoDb()
    const prefs = await db.collection('user_ai_settings').findOne({ user_id: userId })
    const modelId = prefs?.settings?.[feature] as string | undefined
    if (modelId) {
      const found = MODEL_OPTIONS.find(m => m.id === modelId)
      if (found) {
        result.providerOverride = normalizeProvider(found.provider)
        result.modelOverride = found.model
        result.modelRole = found.role === 'fast' ? 'fast' : 'reasoning'
      }
    }
  } catch { /* use defaults */ }

  return result
}

export async function resolveModel(userId: string, feature: ModelPrefKey): Promise<ModelResult> {
  const cacheKey = `${userId}:${feature}`
  const cached = _cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.value
  const value = await resolveModelInner(userId, feature)
  _cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS })
  return value
}

export function invalidateModelCache(userId: string) {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${userId}:`)) _cache.delete(key)
  }
}
