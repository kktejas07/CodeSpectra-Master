import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/portal — a Stripe billing portal session for the caller's
 * own Stripe customer ("Manage payment method"). Returns { url }.
 */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const limited = await limitRequest(req, 'billing-portal', user.id, 10, 60_000)
  if (limited) return limited
  try {
    const { createBillingPortalUrl } = await import('@/lib/stripe-subscriptions')
    const url = await createBillingPortalUrl(user.id)
    if (!url) return NextResponse.json({ error: 'No saved Stripe payment method for this account.' }, { status: 404 })
    return NextResponse.json({ url })
  } catch (e) {
    console.error('[billing/portal]', e)
    const msg = (e as Error)?.message || ''
    if (msg.includes('No payment provider configured')) {
      return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not open the payment settings. Please try again.' }, { status: 500 })
  }
}
