import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

const PLATFORM_KEY = 'llm'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  const db = await getMongoDb()
  const doc = await db.collection('platform_settings').findOne({ key: PLATFORM_KEY })
  const config = doc?.value as { api_key?: string } | null
  return NextResponse.json({ value: config?.api_key ?? null })
}