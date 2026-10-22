/**
 * Stripe success return for a certification attempt. Nothing in the request is
 * trusted: the order is settled from the gateway's status, then the learner
 * lands on the certification page.
 */
import { NextResponse } from 'next/server'
import { getAppOrigin } from '@/lib/app-origin'
import { getAPIUser } from '@/lib/route-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const base = getAppOrigin()
  const { id } = await ctx.params
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return NextResponse.redirect(`${base}/dashboard/certifications/proctored`, 303)
  const user = await getAPIUser()
  const { orderSlug, settleOrder } = await import('@/lib/pro-certs/service')
  let status = 'pending'
  try {
    status = await settleOrder(id)
  } catch (e) {
    console.error('[pro-certs] return settle failed:', (e as Error)?.message)
  }
  const slug = await orderSlug(id, user?.id).catch(() => null)
  if (!slug) return NextResponse.redirect(`${base}/dashboard/certifications/proctored`, 303)
  return NextResponse.redirect(`${base}/dashboard/certifications/proctored/${encodeURIComponent(slug)}?payment=${status === 'paid' ? 'success' : status}`, 303)
}
