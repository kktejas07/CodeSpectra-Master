import type { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { errorResponse, json } from '@/lib/marketplace/seller-api'

/** GET /api/marketplace/seller/me → { seller | null, default_commission_bps, stripe_configured, is_superadmin } (superadmin: ?as=platform) */
export async function GET(req: NextRequest) {
  const a = await requireAuth()
  if ('error' in a) return json({ error: a.error }, a.status)
  try {
    const { ensurePlatformSeller, getSellerByUser, publicSeller, stripeConfigured } = await import('@/lib/marketplace/sellers')
    const { getSettings } = await import('@/lib/marketplace/settings')
    const asPlatform = new URL(req.url).searchParams.get('as') === 'platform' && a.user.role === 'superadmin'
    const s = asPlatform ? await ensurePlatformSeller() : await getSellerByUser(a.user.id)
    const settings = await getSettings()
    return json({
      seller: s ? publicSeller(s) : null,
      default_commission_bps: settings.default_commission_bps,
      effective_commission_bps: s?.is_platform ? 0 : s?.commission_bps ?? settings.default_commission_bps,
      min_payout: settings.min_payout,
      hold_days: settings.hold_days,
      require_product_review: settings.require_product_review,
      stripe_configured: await stripeConfigured(),
      is_superadmin: a.user.role === 'superadmin',
    })
  } catch (e) {
    return errorResponse(e, 'seller me')
  }
}
