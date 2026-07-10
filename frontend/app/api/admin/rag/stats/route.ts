import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const db = await getMongoDb()
  const col = db.collection('embeddings')
  const total = await col.countDocuments()
  const bySourceRaw = await col.aggregate([
    { $group: { _id: '$source', count: { $sum: 1 } } },
  ]).toArray()
  const bySource: Record<string, number> = {}
  for (const r of bySourceRaw) {
    const key = (r._id as string || 'unknown').split(':')[0] || 'other'
    bySource[key] = (bySource[key] || 0) + (r.count as number)
  }

  return NextResponse.json({ total, bySource })
}
