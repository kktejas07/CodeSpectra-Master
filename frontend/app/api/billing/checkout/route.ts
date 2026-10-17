import { NextRequest } from 'next/server'
import { handleCheckoutRequest } from '@/lib/billing-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/billing/checkout { plan_id, interval?: 'month'|'year', coupon_code?, country? }
 * Checks out exactly `plan_id` (static or admin-created). Free plans → 409
 * code 'free_plan'; enterprise / contact-sales plans → 409 code 'contact_sales'.
 */
export async function POST(req: NextRequest) {
  return handleCheckoutRequest(req)
}
