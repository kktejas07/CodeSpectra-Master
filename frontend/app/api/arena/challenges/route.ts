import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { ARENA_CHALLENGES } from '@/lib/arena-challenges'

async function ensureSeeded() {
  try {
    const db = await getMongoDb()
    const col = db.collection('arena_challenges')
    const n = await col.estimatedDocumentCount()
    if (n > 0) return
    await col.insertMany(ARENA_CHALLENGES)
  } catch {
    console.warn('[CodeSpectra] arena challenges auto-seed skipped')
  }
}

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    await ensureSeeded()
    const db = await getMongoDb()
    const data = await db.collection('arena_challenges').find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
