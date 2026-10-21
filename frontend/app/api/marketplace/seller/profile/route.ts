import type { NextRequest } from 'next/server'
import { bodyOf, errorResponse, json, sellerGate } from '@/lib/marketplace/seller-api'

/** PATCH /api/marketplace/seller/profile — store profile, contact, WhatsApp consent, payout method. */
export async function PATCH(req: NextRequest) {
  const g = await sellerGate(req, { write: true })
  if ('res' in g) return g.res
  try {
    if (g.seller.status === 'suspended') return json({ error: 'Your seller account is suspended.', code: 'mkt_seller_suspended' }, 403)
    const { updateSellerProfile, publicSeller } = await import('@/lib/marketplace/sellers')
    return json({ seller: publicSeller(await updateSellerProfile(g.seller, await bodyOf(req))) })
  } catch (e) {
    return errorResponse(e, 'profile')
  }
}
