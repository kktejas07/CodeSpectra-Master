import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { pricingTiers } from '@/lib/db/misc'
import { getMongoDb } from '@/lib/mongodb'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const tier = await (await pricingTiers()).findOne({ id })
    if (!tier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 })
    }
    const db = await getMongoDb()
    const tierFeatures = await db.collection('tier_features').find({ tier_id: id }).toArray()
    return NextResponse.json({ data: tierFeatures })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching tier features:', error)
    return NextResponse.json({ error: 'Failed to fetch tier features' }, { status: 400 })
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const doc = { ...body, tier_id: id, id: crypto.randomUUID(), created_at: new Date().toISOString() }
    const db = await getMongoDb()
    await db.collection('tier_features').insertOne(doc as any)
    return NextResponse.json({ data: doc }, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Error creating tier feature:', error)
    return NextResponse.json({ error: 'Failed to create tier feature' }, { status: 400 })
  }
}
