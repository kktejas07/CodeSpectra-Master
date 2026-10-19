/**
 * PhonePe browser return for marketplace payments. Nothing in the request is trusted — the
 * order is settled from the status API, then the buyer lands on the order page.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAppOrigin } from '@/lib/app-origin'
import { settlePhonePeTxn } from '@/lib/marketplace/settle'
import { orders } from '@/lib/marketplace/order-doc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest): Promise<NextResponse> {
  const base = getAppOrigin()
  const txn = (req.nextUrl.searchParams.get('txn') || '').trim()
  if (!/^MKT[A-Za-z0-9]{1,32}$/.test(txn)) return NextResponse.redirect(`${base}/dashboard/orders`, 303)
  let status = 'pending'
  try {
    status = await settlePhonePeTxn(txn)
  } catch (e) {
    console.error('[marketplace phonepe-return] settle failed:', (e as Error)?.message)
  }
  const order = await (await orders()).findOne({ 'payment.ref': txn } as never, { projection: { _id: 0, id: 1 } })
  if (!order) return NextResponse.redirect(`${base}/dashboard/orders`, 303)
  if (status === 'failed') return NextResponse.redirect(`${base}/marketplace/cart?payment=failed`, 303)
  return NextResponse.redirect(`${base}/dashboard/orders/${order.id}?payment=${status}`, 303)
}

export const GET = handle
export const POST = handle
