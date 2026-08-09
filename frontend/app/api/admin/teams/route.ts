import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const db = await getMongoDb()
    const filter: Record<string, unknown> = {}
    if (gate.user.role === 'tenant_admin' && gate.user.tenantId) {
      filter.$or = [{ tenant_id: gate.user.tenantId }, { tenantId: gate.user.tenantId }]
    }
    const data = await db.collection('teams').find(filter, { projection: { _id: 0 } }).toArray()
    return NextResponse.json({ data })
  } catch { return NextResponse.json({ error: 'Failed' }, { status: 500 }) }
}
