import { NextRequest, NextResponse } from 'next/server'
import { verifyPostalWebhook } from '@/lib/postal-webhook-verify'
import { getMongoDb } from '@/lib/mongodb'
import { getServerSecretsFromCache, warmServerSecretsCache } from '@/lib/server-secrets-cache'

export const runtime = 'nodejs'

const STATUS_MAP: Record<string, string> = {
  Sent: 'delivered',
  MessageSent: 'delivered',
  MessageDelayed: 'sending',
  MessageDeliveryFailed: 'failed',
  MessageHeld: 'sending',
  MessageBounced: 'bounced',
}

export async function POST(request: NextRequest) {
  await warmServerSecretsCache()
  const secrets = getServerSecretsFromCache()

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Cannot read body' }, { status: 400 })
  }

  // RSA signature (X-Postal-Signature[-256]) with the server's public key, or
  // the shared secret as header / ?secret= (lib/postal-webhook-verify.ts).
  const verdict = verifyPostalWebhook({
    rawBody,
    headers: request.headers,
    querySecret: request.nextUrl.searchParams.get('secret'),
    publicKey: secrets.postal_webhook_public_key || process.env.POSTAL_WEBHOOK_PUBLIC_KEY,
    sharedSecret: secrets.postal_webhook_secret || process.env.POSTAL_WEBHOOK_SECRET,
    production: process.env.NODE_ENV === 'production',
  })
  if (!verdict.ok) {
    return verdict.reason === 'not_configured'
      ? NextResponse.json({ error: 'Webhook verification not configured' }, { status: 500 })
      : NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const message = payload.message as Record<string, unknown> | undefined
  const postalMessageId: number | null = message?.id != null ? Number(message.id) : null
  const eventStatus: string = (payload.status as string) || ''
  const eventType: string = (payload.event as string) || eventStatus

  if (!postalMessageId || !eventType) {
    return NextResponse.json({ error: 'Missing message.id or event type' }, { status: 400 })
  }

  // Lifecycle: sending → sent (provider accepted) → delivered (webhook) →
  // opened (tracking pixel / link click). Unknown open/click-style events map
  // to opened so new Postal event names degrade honestly instead of dropping.
  const deliveryStatus =
    STATUS_MAP[eventType] ||
    (/open|click/i.test(eventType) ? 'opened' : null)
  if (!deliveryStatus) {
    return NextResponse.json({ ok: true, skipped: eventType })
  }

  try {
    const db = await getMongoDb()
    const now = new Date().toISOString()

    const details = payload.details as string | undefined
    const output = payload.output as string | undefined
    const errorMsg = details || output || null

    const update: Record<string, unknown> = {
      delivery_status: deliveryStatus,
      delivery_updated_at: now,
    }
    if (errorMsg) update.delivery_error = errorMsg

    // Update candidate_invites collection
    await db.collection('candidate_invites').updateOne(
      { postal_message_id: postalMessageId },
      { $set: update }
    )

    // Also update email_logs collection for monitoring
    try {
      await db.collection('email_logs').updateOne(
        { postal_message_id: postalMessageId },
        { $set: { delivery_status: deliveryStatus, delivery_updated_at: now, ...(errorMsg ? { delivery_error: errorMsg } : {}) } }
      )
    } catch {
      // email_logs update is best-effort
    }

    // Opt-in subscriptions (lib/subscriptions): stop mailing addresses that bounce.
    if (deliveryStatus === 'bounced' || deliveryStatus === 'failed') {
      try {
        const { handleEmailBounce } = await import('@/lib/subscriptions')
        await handleEmailBounce(postalMessageId, deliveryStatus)
      } catch {
        // best-effort
      }
      // A-038: hard bounces / complaints go on the platform suppression list (sendEmail skips them).
      try {
        const { recordDeliveryProblem } = await import('@/lib/automation/outbox')
        await recordDeliveryProblem(postalMessageId, deliveryStatus, errorMsg)
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ ok: true, matched: true, status: deliveryStatus })
  } catch (e: unknown) {
    console.error('[CodeSpectra] postal webhook error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
