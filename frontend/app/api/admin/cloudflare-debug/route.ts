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
    
    return NextResponse.json({
      configured: !!(zoneId && apiToken),
      zoneId: zoneId ? `${zoneId.slice(0, 8)}...` : '(empty)',
      apiToken: apiToken ? `${apiToken.slice(0, 8)}...` : '(empty)',
      hasZoneId: !!zoneId,
      hasApiToken: !!apiToken,
      mongoDocExists: !!doc,
      mongoDocKeys: doc?.value ? Object.keys(doc.value).filter(k => k.includes('cloudflare')) : [],
      envZoneId: !!process.env.CLOUDFLARE_ZONE_ID,
      envApiToken: !!process.env.CLOUDFLARE_API_TOKEN,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
