/**
 * Ebook settings (AUTO-086). The daily AI draft (+ AI cover) spends AI budget,
 * so it is OFF until a superadmin turns it on in Admin → Resources.
 * Stored in platform_settings { key: 'ebooks' }.
 */
import 'server-only'
import { getMongoDb } from '@/lib/mongodb'

export interface EbookSettings { auto_draft_enabled: boolean }

export const EBOOK_SETTINGS_DEFAULTS: EbookSettings = { auto_draft_enabled: false }

export async function getEbookSettings(): Promise<EbookSettings> {
  const doc = await (await getMongoDb()).collection('platform_settings').findOne({ key: 'ebooks' }, { projection: { _id: 0, auto_draft_enabled: 1 } })
  return { auto_draft_enabled: doc?.auto_draft_enabled === true }
}

export async function saveEbookSettings(patch: EbookSettings, by: string): Promise<EbookSettings> {
  await (await getMongoDb()).collection('platform_settings').updateOne(
    { key: 'ebooks' },
    { $set: { auto_draft_enabled: patch.auto_draft_enabled === true, updated_at: new Date().toISOString(), updated_by: by }, $setOnInsert: { key: 'ebooks' } },
    { upsert: true },
  )
  return getEbookSettings()
}
