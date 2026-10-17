import { NextRequest } from 'next/server'
import { handleCheckoutRequest } from '@/lib/billing-checkout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** @deprecated Use POST /api/billing/checkout — same handler, kept for old clients. */
export async function POST(req: NextRequest) {
  return handleCheckoutRequest(req)
}
