import { getMongoDb } from '@/lib/mongodb'
import { MODEL_OPTIONS, type UserAISettings } from '@/lib/ai/model-options'

type ModelPrefKey = keyof UserAISettings
type ModelResult = { providerOverride: string; modelOverride: string; modelRole: 'reasoning' | 'fast' }

// In-memory TTL cache — user model preferences change rarely.
const _cache = new Map<string, { value: ModelResult; expires: number }>()
const CACHE_TTL_MS = 60_000

async function resolveModelInner(userId: string, feature: ModelPrefKey): ReturnType<typeof resolveModel> {
  const result = { providerOverride: '', modelOverride: '', modelRole: 'reasoning' as const }
  try {
    const db = await getMongoDb()
    const prefs = await db.collection('user_ai_settings').findOne({ user_id: userId })
    const modelId = prefs?.settings?.[feature] as string | undefined
    if (modelId) {
      const found = MODEL_OPTIONS.find(m => m.id === modelId)
      if (found) {
        result.providerOverride = found.provider
        result.modelOverride = found.model
        result.modelRole = found.role === 'fast' ? 'fast' : 'reasoning'
      }
    }
  } catch { /* use defaults */ }
  return result
}

export async function resolveModel(userId: string, feature: ModelPrefKey): Promise<{
  providerOverride: string
  modelOverride: string
  modelRole: 'reasoning' | 'fast'
}> {
  const cacheKey = `${userId}:${feature}`
  const cached = _cache.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.value
  const value = await resolveModelInner(userId, feature)
  _cache.set(cacheKey, { value, expires: Date.now() + CACHE_TTL_MS })
  return value
}

// Allow cache-busting on profile update
export function invalidateModelCache(userId: string) {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${userId}:`)) _cache.delete(key)
  }
}
