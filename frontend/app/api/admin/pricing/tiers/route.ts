import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { pricingTiers, newId, nowIso } from '@/lib/db/misc'

const FALLBACK_TIERS = [
  { id: '1', name: 'Free', price_monthly: 0, description: 'Get started', sort_order: 1 },
  { id: '2', name: 'Pro', price_monthly: 2999, description: 'For professionals', sort_order: 2 },
  { id: '3', name: 'Enterprise', price_monthly: 9999, description: 'For teams', sort_order: 3 },
]

export async function GET(_req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const col = await pricingTiers()
    const data = await col.find({}).sort({ sort_order: 1 }).toArray()
    return NextResponse.json({ data: data.length ? data : FALLBACK_TIERS })
  } catch (error) {
    console.error('[CodeSpectra] Error fetching pricing tiers:', error)
    return NextResponse.json({ data: FALLBACK_TIERS }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const doc = { ...body, id: newId(), created_at: nowIso() }
    const col = await pricingTiers()
    await col.insertOne(doc as unknown as Parameters<typeof col.insertOne>[0])
    return NextResponse.json({ data: doc }, { status: 201 })
  } catch (error) {
    console.error('[CodeSpectra] Error creating pricing tier:', error)
    return NextResponse.json({ error: 'Failed to create tier' }, { status: 400 })
  }
}
