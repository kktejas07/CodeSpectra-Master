import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
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

    let routes: string[] = []
    try {
      const user = await getAPIUser()
      if (user) {
        const roleDoc = await db.collection('roles').findOne({ role: user.role })
        const perms = (roleDoc?.permissions || []) as Array<{ resource: string; actions: string[] }>
        routes = perms
          .filter(p => p.resource.startsWith('/dashboard/') && (p.actions.includes('read') || p.actions.includes('manage')))
          .map(p => p.resource)
      }
    } catch {}

    return NextResponse.json({ locked_pages: settings.locked_pages, routes })
  } catch {
    return NextResponse.json({ locked_pages: [], routes: [] })
  }
}
