/**
 * PhonePe S2S callback for certification attempts (callbackUrl set per payment).
 * Checksum verified, then the order is settled from PhonePe's status API only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { decodePhonePeCallback } from '@/lib/phonepe-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (raw.length > 20_000) return NextResponse.json({ success: false }, { status: 413 })
  const decoded = await decodePhonePeCallback(raw, req.headers.get('x-verify') || '')
  if (!decoded) return NextResponse.json({ success: false, error: 'invalid_signature' }, { status: 400 })
  const txn = String(decoded.data?.merchantTransactionId || '')
  const { isCertTxn } = await import('@/lib/pro-certs/payments')
  if (!isCertTxn(txn)) return NextResponse.json({ success: true, ignored: true })
  try {
    const { settleByRef } = await import('@/lib/pro-certs/service')
    const outcome = await settleByRef(txn)
    if (outcome === 'unknown') return NextResponse.json({ success: false, error: 'order_not_found' }, { status: 404 })
    return NextResponse.json({ success: true, status: outcome })
  } catch (e) {
    console.error('[pro-certs phonepe] processing error:', (e as Error)?.message)
    return NextResponse.json({ success: false, error: 'processing_failed' }, { status: 500 })
  }
}
