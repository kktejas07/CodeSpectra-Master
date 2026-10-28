import type { NextRequest } from 'next/server'
import { errorResponse, json, origin, sellerGate } from '@/lib/marketplace/seller-api'

/** POST → { url } Stripe Connect Express onboarding link (US sellers). */
export async function POST(req: NextRequest) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    if (g.seller.is_platform) return json({ error: "The platform store doesn't take payouts.", code: 'mkt_platform_no_payouts' }, 400)
    const { stripeOnboardingLink } = await import('@/lib/marketplace/sellers')
    return json({ url: await stripeOnboardingLink(g.seller, origin(req)) })
  } catch (e) {
    return errorResponse(e, 'stripe link')
  }
}

/** GET → { ready } refreshes payouts_enabled from Stripe. */
export async function GET(req: NextRequest) {
  const g = await sellerGate(req)
  if ('res' in g) return g.res
  try {
    const { refreshStripeStatus } = await import('@/lib/marketplace/sellers')
    return json({ ready: await refreshStripeStatus(g.seller) })
  } catch (e) {
    return errorResponse(e, 'stripe status')
  }
}
