import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { readServerSecrets } from '@/lib/server-secrets-cache'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const secrets = await readServerSecrets()
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'secrets' })
    
    const zoneId = (secrets.cloudflare_zone_id?.trim() || '') || process.env.CLOUDFLARE_ZONE_ID?.trim() || ''
    const apiToken = (secrets.cloudflare_api_token?.trim() || '') || process.env.CLOUDFLARE_API_TOKEN?.trim() || ''
    
    // Get raw values from MongoDB document
    const rawDoc = doc?.value as Record<string, unknown> | undefined
    const rawZoneId = rawDoc?.cloudflare_zone_id
    const rawApiToken = rawDoc?.cloudflare_api_token
    
    return NextResponse.json({
      configured: !!(zoneId && apiToken),
      zoneId: zoneId ? `${zoneId.slice(0, 8)}...` : '(empty)',
      apiToken: apiToken ? `${apiToken.slice(0, 8)}...` : '(empty)',
      hasZoneId: !!zoneId,
      hasApiToken: !!apiToken,
      mongoDocExists: !!doc,
      mongoDocKeys: doc?.value ? Object.keys(doc.value).filter(k => k.includes('cloudflare')) : [],
      rawZoneId: rawZoneId ? `${String(rawZoneId).slice(0, 8)}...` : '(missing)',
      rawApiToken: rawApiToken ? `${String(rawApiToken).slice(0, 8)}...` : '(missing)',
      rawApiTokenLength: rawApiToken ? String(rawApiToken).length : 0,
      envZoneId: !!process.env.CLOUDFLARE_ZONE_ID,
      envApiToken: !!process.env.CLOUDFLARE_API_TOKEN,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
