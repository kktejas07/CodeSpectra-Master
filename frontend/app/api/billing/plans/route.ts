import { NextResponse } from 'next/server'
import { getMergedBillingPlans, mergedPlanToClientJson } from '@/lib/pricing-catalog'

export async function GET() {
  try {
    const merged = await getMergedBillingPlans()
    return NextResponse.json(merged.map(mergedPlanToClientJson))
  } catch (e) {
    console.error('[CodeSpectra] Billing plans error:', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
