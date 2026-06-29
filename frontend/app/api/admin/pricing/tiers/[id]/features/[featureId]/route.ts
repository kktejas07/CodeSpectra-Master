import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; featureId: string }> }) {
  const { id, featureId } = await params
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const db = await getMongoDb()
    const existing = await db.collection('tier_features').findOne({ tier_id: id, feature_id: featureId })
    if (existing) {
      await db.collection('tier_features').updateOne(
        { tier_id: id, feature_id: featureId },
        { $set: { is_enabled: body.is_enabled, updated_at: new Date().toISOString() } }
      )
    } else {
      const doc = {
        tier_id: id,
        feature_id: featureId,
        is_enabled: body.is_enabled ?? true,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      }
      await db.collection('tier_features').insertOne(doc as any)
    }
    const updated = await db.collection('tier_features').findOne({ tier_id: id, feature_id: featureId })
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('[CodeSpectra] Error toggling tier feature:', error)
    return NextResponse.json({ error: 'Failed to toggle feature' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; featureId: string }> }) {
  const { id, featureId } = await params
  const gate = await requireAuth()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const db = await getMongoDb()
    await db.collection('tier_features').deleteOne({ tier_id: id, feature_id: featureId })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CodeSpectra] Error deleting tier feature:', error)
    return NextResponse.json({ error: 'Failed to delete feature' }, { status: 400 })
  }
}
