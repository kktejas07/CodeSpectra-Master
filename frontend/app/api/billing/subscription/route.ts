import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import { getServiceSupabase } from '@/lib/admin-service-client'
import { composeSubscriptionResponse, getSubscriptionRow } from '@/lib/billing-server'
import type { BillingInterval, BillingPlanId } from '@/lib/billing-catalog'
import { warmServerSecretsCache } from '@/lib/server-secrets-cache'
import { getStripePriceId, getStripeSecretKey } from '@/lib/stripe-env'
import { updateStripeSubscriptionInterval } from '@/lib/stripe-server'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    const row = await getSubscriptionRow(supabase, user.id)
    return NextResponse.json(await composeSubscriptionResponse(row, user.email))
  } catch (error) {
    console.error('[CodeSpectra] Subscription fetch error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

/** Update billing interval (month ↔ year) for the next renewal. */
export async function PUT(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const interval = body.billingInterval === 'year' ? 'year' : 'month'

    const supabase = getServiceSupabase()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.' },
        { status: 503 }
      )
    }

    const row = await getSubscriptionRow(supabase, user.id)
    if (!row || row.status === 'canceled') {
      return NextResponse.json({ error: 'No active subscription to update' }, { status: 400 })
    }

    await warmServerSecretsCache()
    const planId = (row.plan_id as BillingPlanId) || 'pro'
    const stripeSubId = row.stripe_subscription_id
    if (stripeSubId && getStripeSecretKey()) {
      const priceId = getStripePriceId(planId, interval)
      if (!priceId) {
        return NextResponse.json(
          { error: 'Stripe price IDs are not configured for this billing interval.' },
          { status: 503 }
        )
      }
      await updateStripeSubscriptionInterval({ stripeSubscriptionId: stripeSubId, newPriceId: priceId })
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        billing_interval: interval as BillingInterval,
        updated_at: now,
      })
      .eq('user_id', user.id)

    if (error) throw error

    const next = await getSubscriptionRow(supabase, user.id)
    return NextResponse.json(await composeSubscriptionResponse(next, user.email))
  } catch (error) {
    console.error('[CodeSpectra] Subscription update error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
