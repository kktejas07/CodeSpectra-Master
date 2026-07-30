import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const data = await db.collection('security_settings').find({}).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}

export async function PATCH(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const { name, status } = await request.json()
    if (!name || !['enabled', 'disabled'].includes(status)) {
      return NextResponse.json({ error: 'name and status (enabled|disabled) required' }, { status: 400 })
    }
    const db = await getMongoDb()
    await db.collection('security_settings').updateOne(
      { name },
      { $set: { status, updated_at: new Date().toISOString() } },
      { upsert: true },
    )
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
