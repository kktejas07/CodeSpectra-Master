import { NextResponse } from 'next/server'
import { mergeGeneralPlatformSettings } from '@/lib/platform-general-settings'
import { getMongoDb } from '@/lib/mongodb'
import type { Collection } from 'mongodb'

interface PlatformSettingDoc {
  key: string
  value: Record<string, unknown>
  updated_at: string
}

export const runtime = 'nodejs'

export async function GET() {
  try {
    const db = await getMongoDb()
    const col = db.collection<PlatformSettingDoc>('platform_settings')
    const doc = await col.findOne({ key: 'general' })
    const settings = mergeGeneralPlatformSettings(doc?.value)
    return NextResponse.json({ locked_pages: settings.locked_pages })
  } catch {
    return NextResponse.json({ locked_pages: [] })
  }
}
