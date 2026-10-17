/**
 * PhonePe S2S callback. Body {response: base64}, header X-VERIFY =
 * sha256(response + saltKey)###saltIndex. After the checksum check the order
 * is settled from PhonePe's status API (the callback's own state is not
 * trusted). NEEDS A SANDBOX TEST (PhonePe PG v1).
 */
import { NextRequest, NextResponse } from 'next/server'
import { decodePhonePeCallback } from '@/lib/phonepe-server'
import { settlePhonePeOrder } from '@/lib/billing/phonepe-settle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (raw.length > 20_000) return NextResponse.json({ success: false }, { status: 413 })
  const decoded = await decodePhonePeCallback(raw, req.headers.get('x-verify') || '')
  if (!decoded) {
    console.error('[phonepe-webhook] invalid checksum or payload')
    return NextResponse.json({ success: false, error: 'invalid_signature' }, { status: 400 })
  }
  const txn = String(decoded.data?.merchantTransactionId || '')
  try {
    const outcome = await settlePhonePeOrder(txn)
    if (outcome === 'unknown') return NextResponse.json({ success: false, error: 'order_not_found' }, { status: 404 })
    return NextResponse.json({ success: true, status: outcome })
  } catch (e) {
    console.error('[phonepe-webhook] processing error:', e)
    return NextResponse.json({ success: false, error: 'processing_failed' }, { status: 500 })
  }
}
