import { getMongoDb } from '@/lib/mongodb'
import { mergeGeneralPlatformSettings, type GeneralPlatformSettings } from './platform-general-settings'

export async function getGeneralSettings(): Promise<GeneralPlatformSettings> {
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: 'general' })
  return mergeGeneralPlatformSettings(doc?.value as Record<string, unknown> | undefined)
}
