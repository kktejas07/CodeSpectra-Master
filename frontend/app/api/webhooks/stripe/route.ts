import { NextRequest, NextResponse } from 'next/server'
import { warmServerSecretsCache } from '@/lib/server-secrets-cache'
import { getStripeSecretKey, getStripeWebhookSecret } from '@/lib/stripe-env'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  await warmServerSecretsCache()
  const whSecret = getStripeWebhookSecret()
  const secretKey = getStripeSecretKey()
  if (!whSecret || !secretKey) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }

  // Stripe webhook processing is temporarily unavailable during MongoDB migration.
  return NextResponse.json({ error: 'Stripe webhook processing is temporarily unavailable' }, { status: 503 })
}
