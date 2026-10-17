import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { getClientPlans } from '@/lib/pricing-catalog-server'

/**
 * In-app plan catalog. checkout_mode, price and currency come from the same
 * resolver checkout uses, so the button and the amount a plan shows always
 * match what the server will charge.
 */
export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    return NextResponse.json(await getClientPlans())
  } catch (e) {
    console.error('[CodeSpectra] Billing plans error:', e)
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 })
  }
}
