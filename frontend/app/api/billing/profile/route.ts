import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/billing/profile — the caller's invoice details (name, GSTIN, place of supply) + account credit. */
export async function GET() {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  try {
    const [{ getBillingProfile }, { availableCredit }] = await Promise.all([import('@/lib/billing/tax-invoice'), import('@/lib/billing/credits')])
    const [profile, inr, usd] = await Promise.all([
      getBillingProfile(`user:${gate.user.id}`),
      availableCredit(gate.user.id, 'INR'),
      availableCredit(gate.user.id, 'USD'),
    ])
    return NextResponse.json({ profile, credit: { INR: inr, USD: usd } })
  } catch (e) {
    console.error('[billing/profile] GET', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

/** PUT /api/billing/profile — save invoice details; a GSTIN must be valid and fixes the place of supply. */
export async function PUT(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const limited = await limitRequest(req, 'billing-profile', gate.user.id, 20, 60_000)
  if (limited) return limited
  const { billingProfileSchema, saveBillingProfile } = await import('@/lib/billing/tax-invoice')
  const parsed = billingProfileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message
    const code = msg === 'gstin_invalid' || msg === 'state_invalid' ? `billing_${msg}` : 'invalid_request'
    return NextResponse.json({ error: code === 'billing_gstin_invalid' ? 'Enter a valid GSTIN.' : 'Check the details and try again.', code }, { status: 400 })
  }
  try {
    return NextResponse.json({ profile: await saveBillingProfile(`user:${gate.user.id}`, parsed.data) })
  } catch (e) {
    console.error('[billing/profile] PUT', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
