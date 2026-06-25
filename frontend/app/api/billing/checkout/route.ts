import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import { completeCheckout } from '@/lib/billing-server'
import type { BillingInterval, BillingPlanId } from '@/lib/billing-catalog'
import { stripeCheckoutConfigured } from '@/lib/stripe-env'
import { createStripeCheckoutSession } from '@/lib/stripe-server'

function parsePlan(raw: string | null): BillingPlanId {
  if (raw === 'pro' || raw === 'enterprise' || raw === 'free') return raw
  return 'pro'
}

function parseInterval(raw: string | null): BillingInterval {
  return raw === 'year' ? 'year' : 'month'
}

/** Backward-compatible: `GET /api/billing/checkout?plan=pro&interval=month` completes checkout and redirects. */
export async function GET(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }

    const { searchParams } = new URL(req.url)
    const planId = parsePlan(searchParams.get('plan'))
    const interval = parseInterval(searchParams.get('interval'))
    if (planId === 'free') {
      return NextResponse.redirect(new URL('/dashboard/billing?error=free_checkout', req.url))
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.redirect(new URL('/dashboard/billing?error=no_service_key', req.url))
    }

    const baseUrl = new URL(req.url).origin
    if (await stripeCheckoutConfigured(planId, interval)) {
      const { url } = await createStripeCheckoutSession({
        supabase,
        userId: user.id,
        userEmail: user.email ?? '',
        planId,
        interval,
        baseUrl,
      })
      return NextResponse.redirect(url)
    }

    await completeCheckout({
      supabase,
      userId: user.id,
      userEmail: user.email,
      planId,
      interval,
      baseUrl,
    })

    return NextResponse.redirect(new URL('/dashboard/billing?paid=1', req.url))
  } catch (error) {
    console.error('[CodeSpectra] Checkout GET error:', error)
    return NextResponse.redirect(new URL('/dashboard/billing?error=checkout', req.url))
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const planId = parsePlan(typeof body.plan === 'string' ? body.plan : null)
    const interval = parseInterval(typeof body.interval === 'string' ? body.interval : null)

    if (planId === 'free') {
      return NextResponse.json({ error: 'Use billing settings to stay on Free' }, { status: 400 })
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    const baseUrl = new URL(req.url).origin
    if (await stripeCheckoutConfigured(planId, interval)) {
      const { url } = await createStripeCheckoutSession({
        supabase,
        userId: user.id,
        userEmail: user.email ?? '',
        planId,
        interval,
        baseUrl,
      })
      return NextResponse.json({ success: true, url, stripe: true })
    }

    const { downloadPath } = await completeCheckout({
      supabase,
      userId: user.id,
      userEmail: user.email,
      planId,
      interval,
      baseUrl,
    })

    return NextResponse.json({
      success: true,
      url: `/dashboard/billing?paid=1`,
      downloadPath,
      stripe: false,
    })
  } catch (error) {
    console.error('[CodeSpectra] Checkout POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
