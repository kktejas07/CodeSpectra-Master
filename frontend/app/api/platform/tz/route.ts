import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const db = await getMongoDb()
    const doc = await db.collection('platform_settings').findOne({ key: 'general' })
    const tz = (doc?.value as any)?.timezone || 'Asia/Kolkata'
    return NextResponse.json({ timezone: tz })
  } catch {
    return NextResponse.json({ timezone: 'Asia/Kolkata' })
  }
}
