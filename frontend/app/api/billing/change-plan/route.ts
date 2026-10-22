import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/route-auth'
import { limitRequest } from '@/lib/rate-limit'
import { apiErrorFor } from '@/lib/api-errors'
import { parseInterval } from '@/lib/billing-plan-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  plan_id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/i),
  interval: z.string().max(10).optional(),
  /** false = preview only. */
  confirm: z.boolean().optional(),
}).strict()

const STATUS: Record<string, number> = { no_subscription: 404, unknown_plan: 404 }

/**
 * POST /api/billing/change-plan { plan_id, interval, confirm? }
 * Preview (confirm false) or perform an upgrade of the live plan with
 * proration (lib/billing/plan-change.ts). Downgrades happen at renewal.
 */
export async function POST(req: Request) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json(apiErrorFor('unauthorized'), { status: 401 })
  const limited = await limitRequest(req, 'billing-change-plan', gate.user.id, 20, 60_000)
  if (limited) return limited
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json(apiErrorFor('invalid_request'), { status: 400 })
  const interval = parseInterval(parsed.data.interval)
  try {
    const { planChangeContext, changeStripePlan } = await import('@/lib/billing/plan-change')
    const r = await planChangeContext(gate.user.id, parsed.data.plan_id, interval)
    if (!r.ok) return NextResponse.json({ error: r.code, code: `billing_${r.code}` }, { status: STATUS[r.code] ?? 409 })
    const { sub, target, quote } = r.ctx
    if (!quote.ok) return NextResponse.json({ error: 'invalid', code: 'billing_invalid' }, { status: 409 })
    const preview = { kind: quote.kind, charge_now: quote.chargeNow, credit: quote.credit, currency: target.currency, period_end: quote.periodEnd, plan: { id: target.id, name: target.name, interval } }
    if (!parsed.data.confirm) return NextResponse.json({ preview })
    if (quote.kind === 'downgrade_at_renewal' || quote.kind === 'no_change') {
      return NextResponse.json({ error: 'Plan downgrades take effect at renewal.', code: 'billing_downgrade_at_renewal', preview }, { status: 409 })
    }

    // Stripe prorates itself; the invoice.paid webhook switches the plan.
    if (sub.billing_mode === 'stripe_subscription' && sub.stripe_subscription_id) {
      await changeStripePlan(sub, target)
      return NextResponse.json({ ok: true, provider: 'stripe', pending: true, preview })
    }

    const { PaymentService, CheckoutError } = await import('@/lib/payment-service')
    try {
      const result = await new PaymentService().createCheckout(gate.user.id, gate.user.email, target.id, null, undefined, interval, {
        currency: target.currency,
        chargeOverride: quote.chargeNow,
        useCredit: false,
        extras: {
          fields: {
            proration_kind: quote.kind,
            proration_credit: quote.credit,
            ...(quote.kind === 'upgrade_same_cycle' ? { keep_period_end: quote.periodEnd } : {}),
          },
        },
      })
      return NextResponse.json({ ...result, preview })
    } catch (e) {
      if (e instanceof CheckoutError) return NextResponse.json({ error: e.message, code: e.code }, { status: 409 })
      throw e
    }
  } catch (e) {
    const msg = (e as Error)?.message || ''
    console.error('[billing/change-plan]', msg)
    if (msg.includes('No payment provider configured')) return NextResponse.json({ error: "Payments aren't set up yet.", code: 'payments_not_configured' }, { status: 503 })
    return NextResponse.json(apiErrorFor('server_error_retry'), { status: 500 })
  }
}
