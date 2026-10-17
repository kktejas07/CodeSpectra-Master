/**
 * PhonePe browser return (redirectMode REDIRECT). The browser lands here
 * after the hosted pay page; nothing in the request is trusted — the order is
 * settled from PhonePe's status API, then the user is sent to the billing
 * page with the outcome. NEEDS A SANDBOX TEST (PhonePe PG v1).
 */
import { NextRequest, NextResponse } from 'next/server'
import { settlePhonePeOrder } from '@/lib/billing/phonepe-settle'
import { getAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest): Promise<NextResponse> {
  const base = getAppOrigin()
  const txn = (req.nextUrl.searchParams.get('txn') || '').trim()
  let status: string = 'failed'
  if (/^[A-Za-z0-9_-]{1,35}$/.test(txn)) {
    try {
      const outcome = await settlePhonePeOrder(txn)
      status = outcome === 'unknown' ? 'failed' : outcome
    } catch (e) {
      console.error('[phonepe-callback] settle failed:', e)
      status = 'pending'
    }
  }
  return NextResponse.redirect(`${base}/dashboard/billing?payment=phonepe&status=${status}`, 303)
}

export const GET = handle
// PhonePe may POST the redirect for redirectMode POST; treat it the same way.
export const POST = handle
