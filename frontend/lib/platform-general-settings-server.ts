import { getMongoDb } from '@/lib/mongodb'
import { mergeGeneralPlatformSettings, type GeneralPlatformSettings } from './platform-general-settings'

export async function getGeneralSettings(): Promise<GeneralPlatformSettings> {
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: 'general' })
  return mergeGeneralPlatformSettings(doc?.value as Record<string, unknown> | undefined)
}

// Short per-process cache for hot paths (sign-in, page gate). Saves from the
// admin settings route call invalidateGeneralSettingsCache(); other instances
// pick changes up within the TTL.
const TTL_MS = 15_000
let _cached: { at: number; value: GeneralPlatformSettings } | null = null

export async function getGeneralSettingsCached(): Promise<GeneralPlatformSettings> {
  if (_cached && Date.now() - _cached.at < TTL_MS) return _cached.value
  const value = await getGeneralSettings()
  _cached = { at: Date.now(), value }
  return value
}

export function invalidateGeneralSettingsCache(): void {
  _cached = null
}
