import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getMergedBillingPlans, mergedPlanToClientJson } from '@/lib/pricing-catalog'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const merged = await getMergedBillingPlans()
    return NextResponse.json(merged.map(mergedPlanToClientJson))
  } catch (e) {
    console.error('[CodeSpectra] Billing plans error:', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
