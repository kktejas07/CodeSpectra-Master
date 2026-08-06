/**
 * Server-side currency getter.
 * Reads platform_currency from platform_settings collection.
 * Caches for 60s to avoid hammering MongoDB on every request.
 */

import { getMongoDb } from '@/lib/mongodb'
import { mergeGeneralPlatformSettings } from '@/lib/platform-general-settings'

let cachedCurrency: string | null = null
let cacheExpiry = 0

export async function getPlatformCurrency(): Promise<string> {
  const now = Date.now()
  if (cachedCurrency && now < cacheExpiry) return cachedCurrency

  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'general' })
    const settings = mergeGeneralPlatformSettings(doc?.value)
    cachedCurrency = settings.platform_currency || 'USD'
    cacheExpiry = now + 60_000
    return cachedCurrency
  } catch {
    return 'USD'
  }
}

/** Clear the cache (e.g. after settings save). */
export function invalidateCurrencyCache() {
  cachedCurrency = null
  cacheExpiry = 0
}
