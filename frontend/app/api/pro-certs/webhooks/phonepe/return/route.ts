/** PhonePe browser return for certification attempts: settle from the status API, then back to the certification page. */
import { NextRequest, NextResponse } from 'next/server'
import { getAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(req: NextRequest): Promise<NextResponse> {
  const base = getAppOrigin()
  const txn = (req.nextUrl.searchParams.get('txn') || '').trim()
  const { isCertTxn } = await import('@/lib/pro-certs/payments')
  if (!isCertTxn(txn)) return NextResponse.redirect(`${base}/dashboard/certifications/proctored`, 303)
  const { settleByRef } = await import('@/lib/pro-certs/service')
  const { orders } = await import('@/lib/pro-certs/db')
  let status = 'pending'
  try { status = await settleByRef(txn) } catch (e) { console.error('[pro-certs phonepe-return] settle failed:', (e as Error)?.message) }
  const o = await (await orders()).findOne({ 'payment.ref': txn } as never, { projection: { _id: 0, program_slug: 1 } })
  if (!o) return NextResponse.redirect(`${base}/dashboard/certifications/proctored`, 303)
  return NextResponse.redirect(`${base}/dashboard/certifications/proctored/${encodeURIComponent(String(o.program_slug))}?payment=${status === 'paid' ? 'success' : status}`, 303)
}

export const GET = handle
export const POST = handle
