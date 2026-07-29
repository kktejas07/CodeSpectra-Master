import { NextRequest, NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'

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

  const deliveryStatus = STATUS_MAP[eventType] || null
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

    await db.collection('candidate_invites').updateOne(
      { postal_message_id: postalMessageId },
      { $set: update }
    )

    return NextResponse.json({ ok: true, matched: true, status: deliveryStatus })
  } catch (e: unknown) {
    console.error('[CodeSpectra] postal webhook error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
