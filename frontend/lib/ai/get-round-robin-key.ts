import { getMongoDb } from '@/lib/mongodb'
import { isMaskedSecret } from '@/lib/server-secrets-cache'
import { type LLMConfig, type LLMProviderId } from '@/lib/llm-config'

export async function getRoundRobinKey(provider: LLMProviderId): Promise<string | null> {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'llm' })
    if (!doc?.value) return null
    const cfg = doc.value as unknown as LLMConfig
    if (!cfg.keys || !cfg.keys[provider] || cfg.keys[provider]!.length === 0) {
      return cfg.api_key || null // Fallback to legacy
    }
    
    const keys = cfg.keys[provider]!
    const now = Date.now()
    
    // Filter active keys
    const activeKeys = keys.filter(k => !k.rate_limited_until || k.rate_limited_until < now)
    if (activeKeys.length === 0) return null
    
    // Pick the one with the lowest usage_count
    activeKeys.sort((a, b) => (a.usage_count || 0) - (b.usage_count || 0))
    const selected = activeKeys[0]

    // ponytail: platform_settings.llm is a legacy shadow store — entries here
    // WIN over freshly saved secrets, so a stale/masked placeholder ("ab••…
    // …1234") would 401 every call while the real key sits unused. Refuse to
    // return anything that isn't a plausible raw key; callers fall through
    // to server secrets / env.
    const raw = typeof selected.key === 'string' ? selected.key.trim() : ''
    if (!raw || raw.length < 10 || isMaskedSecret(raw)) return null
    
    // Fire and forget: increment usage count
    db.collection('platform_settings').updateOne(
      { key: 'llm', [`value.keys.${provider}.id`]: selected.id },
      { $inc: { [`value.keys.${provider}.$.usage_count`]: 1 } }
    ).catch(() => {})

    return raw
  } catch {
    return null
  }
}

export async function markKeyRateLimited(provider: LLMProviderId, keyString: string, delayMs: number = 60000) {
  try {
    const db = await getMongoDb()
    await db.collection('platform_settings').updateOne(
      { key: 'llm', [`value.keys.${provider}.key`]: keyString },
      { $set: { [`value.keys.${provider}.$.rate_limited_until`]: Date.now() + delayMs } }
    )
  } catch {}
}
