import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'

export async function GET() {
  const checks: Record<string, string> = {}
  let allOk = true

  try {
    const db = await getMongoDb()
    await db.command({ ping: 1 })
    checks.mongodb = 'ok'
  } catch (e) {
    checks.mongodb = `error: ${e instanceof Error ? e.message : 'unknown'}`
    allOk = false
  }

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 },
  )
}
