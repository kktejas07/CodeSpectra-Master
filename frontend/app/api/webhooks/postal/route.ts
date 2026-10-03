import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
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
  const expectedSecret = secrets.postal_webhook_secret?.trim()
  if (!expectedSecret) {
    // Fail-closed in production: an unverified webhook must not mutate delivery state.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
  } else {
    const receivedSecret = request.headers.get('x-postal-webhook-secret') || request.headers.get('x-postal-secret') || ''
    const a = Buffer.from(receivedSecret)
    const b = Buffer.from(expectedSecret)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Cannot read body' }, { status: 400 })
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
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

    return NextResponse.json({ ok: true, matched: true, status: deliveryStatus })
  } catch (e: unknown) {
    console.error('[CodeSpectra] postal webhook error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
