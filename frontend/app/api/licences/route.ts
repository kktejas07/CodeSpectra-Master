import { NextResponse } from 'next/server'
import { licenceGate } from '@/lib/billing/licence-access'
import { licencePurchaseSchema } from '@/lib/billing/licence-rules'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorFor } from '@/lib/api-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/licences — the organisation's licences, pricing, and seat usage. */
export async function GET(req: Request) {
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!g.orgId) return NextResponse.json({ error: 'Choose an organisation.', code: 'licence_org_required' }, { status: 400 })
  try {
    const [{ listOrgLicences, seatUsage, orgInfo }, { getBillingSettings }, { getBillingProfile }] = await Promise.all([import('@/lib/billing/licences'), import('@/lib/billing/settings'), import('@/lib/billing/tax-invoice')])
    const [list, settings, org, profile] = await Promise.all([listOrgLicences(g.orgId), getBillingSettings(), orgInfo(g.orgId), getBillingProfile(`org:${g.orgId}`)])
    const licences = await Promise.all(list.map(async (l) => ({ ...l, usage: await seatUsage(l.id) })))
    return NextResponse.json({
      org,
      profile,
      licences,
      pricing: { seat_price_minor: settings.licence_seat_price_minor, min_seats: settings.licence_min_seats },
    })
  } catch (e) {
    console.error('[licences] GET', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

/**
 * POST /api/licences { seats, currency, licence_id? } — buy (or renew / resize)
 * a yearly Pro licence. Priced on the server; the order is billed to the org
 * (its billing profile) and activates the licence when paid.
 */
export async function POST(req: Request) {
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!g.orgId) return NextResponse.json({ error: 'Choose an organisation.', code: 'licence_org_required' }, { status: 400 })
  const limited = await limitRequest(req, 'licence-checkout', g.user.id, 10, 60_000)
  if (limited) return limited
  const parsed = licencePurchaseSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  try {
    const { prepareLicencePurchase } = await import('@/lib/billing/licences')
    const prep = await prepareLicencePurchase({ orgId: g.orgId, seats: parsed.data.seats, currency: parsed.data.currency, licenceId: parsed.data.licence_id, actorId: g.user.id })
    if (!prep.ok) return NextResponse.json({ error: prep.code, code: prep.code.startsWith('licence_') ? prep.code : `licence_${prep.code}` }, { status: prep.code.endsWith('not_found') ? 404 : 400 })
    if (prep.amount <= 0) return NextResponse.json({ error: 'Licences are not on sale in this currency.', code: 'licence_not_on_sale' }, { status: 409 })
    const { PaymentService } = await import('@/lib/payment-service')
    const plan = {
      id: 'licence_pro',
      name: `CodeSpectra Pro licence × ${parsed.data.seats} seats (1 year)`,
      amount_paise: prep.amount,
      currency: parsed.data.currency,
      kind: 'licence' as const,
      perks: ['Pro for every seat holder'],
      mode: 'checkout' as const,
      source: 'static' as const,
    }
    const adapter = await new PaymentService().getAdapterForCheckout(plan.currency, null, null)
    const result = await adapter.createCheckout(g.user.id, g.user.email, plan.id, plan, undefined, {
      oneOff: true,
      fields: { org_id: g.orgId, licence_id: prep.licence.id, licence_seats: parsed.data.seats },
    })
    return NextResponse.json({ ...result, licence_id: prep.licence.id })
  } catch (e) {
    const msg = (e as Error)?.message || ''
    console.error('[licences] POST', msg)
    if (msg.includes('No payment provider configured')) return NextResponse.json({ error: "Payments aren't set up yet.", code: 'payments_not_configured' }, { status: 503 })
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}

/** PUT /api/licences — the organisation's invoice details (name, GSTIN, place of supply) for licence invoices. */
export async function PUT(req: Request) {
  const g = await licenceGate(new URL(req.url).searchParams.get('org'))
  if (!g.ok) return NextResponse.json({ error: g.error, code: g.code }, { status: g.status })
  if (!g.orgId) return NextResponse.json({ error: 'Choose an organisation.', code: 'licence_org_required' }, { status: 400 })
  const { billingProfileSchema, saveBillingProfile } = await import('@/lib/billing/tax-invoice')
  const parsed = billingProfileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message
    return NextResponse.json({ error: 'Check the details and try again.', code: msg === 'gstin_invalid' || msg === 'state_invalid' ? `billing_${msg}` : 'invalid_request' }, { status: 400 })
  }
  try {
    return NextResponse.json({ profile: await saveBillingProfile(`org:${g.orgId}`, parsed.data) })
  } catch (e) {
    console.error('[licences] PUT', (e as Error)?.message)
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
