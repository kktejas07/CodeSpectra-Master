/**
 * CORE-039: Razorpay Payment Link browser return for marketplace orders. The callback
 * signature is checked, but nothing in the query is trusted for money: the order is
 * settled from Razorpay's view of the link, then the buyer lands on the order page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const base = getAppOrigin()
  const orderId = (req.nextUrl.searchParams.get('order') || '').trim()
  if (!/^[A-Za-z0-9-]{8,64}$/.test(orderId)) return NextResponse.redirect(`${base}/dashboard/orders`, 303)
  const { verifyPaymentLinkCallback } = await import('@/lib/razorpay-links')
  // A cancelled / abandoned page returns without a signature — still re-read the link (harmless).
  if (req.nextUrl.searchParams.has('razorpay_signature') && !(await verifyPaymentLinkCallback(req.nextUrl.searchParams))) {
    console.error('[marketplace razorpay-return] bad callback signature', { order: orderId })
  }
  let status = 'pending'
  try {
    const { settleRazorpayOrder } = await import('@/lib/marketplace/settle')
    status = await settleRazorpayOrder({ orderId })
  } catch (e) {
    console.error('[marketplace razorpay-return] settle failed:', (e as Error)?.message)
  }
  if (status === 'unknown') return NextResponse.redirect(`${base}/dashboard/orders`, 303)
  if (status === 'failed') return NextResponse.redirect(`${base}/marketplace/cart?payment=failed`, 303)
  return NextResponse.redirect(`${base}/dashboard/orders/${orderId}?payment=${status}`, 303)
}
