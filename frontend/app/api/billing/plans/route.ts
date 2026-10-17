import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { mergedPlanToClientJson } from '@/lib/pricing-catalog'
import { getMergedBillingPlans } from '@/lib/pricing-catalog-server'
import { resolveBillingPlan } from '@/lib/billing-plans'
import { planCheckoutMode } from '@/lib/billing-plan-mode'

export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const merged = await getMergedBillingPlans()
    // checkout_mode comes from the same resolver checkout uses, so the button
    // a plan shows always matches what the server will accept.
    const rows = await Promise.all(
      merged.map(async (p) => {
        const resolved = await resolveBillingPlan(String(p.id)).catch(() => null)
        const checkout_mode = resolved?.mode ?? planCheckoutMode({ id: String(p.id), price: p.monthlyUsd, yearlyPrice: p.yearlyUsd })
        return { ...mergedPlanToClientJson(p), checkout_mode }
      }),
    )
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[CodeSpectra] Billing plans error:', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
