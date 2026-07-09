import { getMongoDb } from '@/lib/mongodb'
import { MODEL_OPTIONS, type UserAISettings } from '@/lib/ai/model-options'

type ModelPrefKey = keyof UserAISettings

export async function resolveModel(userId: string, feature: ModelPrefKey): Promise<{
  providerOverride: string
  modelOverride: string
  modelRole: 'reasoning' | 'fast'
}> {
  const result: { providerOverride: string; modelOverride: string; modelRole: 'reasoning' | 'fast' } = { providerOverride: '', modelOverride: '', modelRole: 'reasoning' }
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
