import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET() {
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: 'mobile' })
  const config = (doc?.value as Record<string, unknown>) || {}
  const serverUrl = (config.server_url as string) || process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.forgetechno.com'

  return NextResponse.json({
    server_url: serverUrl.replace(/[^\x20-\x7E]/g, '').replace(/\/+$/, ''),
    app_name: 'CodeSpectra',
    version: '1.0.0',
  })
}
