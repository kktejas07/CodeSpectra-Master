import { NextResponse } from 'next/server'
import { mergedPlanToClientJson } from '@/lib/pricing-catalog'
import { getMergedBillingPlans } from '@/lib/pricing-catalog-server'

/** Public catalog for marketing pages (no auth). */
export async function GET() {
  try {
    const merged = await getMergedBillingPlans()
    return NextResponse.json(merged.map(mergedPlanToClientJson))
  } catch (e) {
    console.error('[CodeSpectra] Public pricing plans error:', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
