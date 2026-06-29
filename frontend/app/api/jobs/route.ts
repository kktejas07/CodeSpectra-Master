import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const data = await db.collection('jobs').find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
