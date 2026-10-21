/**
 * Exotel (India) call status callback. Exotel doesn't sign callbacks, so the
 * URL carries a shared secret: /api/ats/screening/webhooks/exotel?token=<exotel_webhook_token>.
 * Optional — numbers are normally imported into Vapi (SIP trunk) which reports via /webhooks/vapi.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/ats/screening/config'
import { verifySharedToken } from '@/lib/ats/screening/signatures'
import { handleCallStatus, type CallStatusEvent } from '@/lib/ats/screening/machine'
import { claimEvent, releaseEvent } from '@/lib/ats/screening/store'

export const runtime = 'nodejs'

const MAP: Record<string, CallStatusEvent['event']> = {
  ringing: 'ringing', 'in-progress': 'connected', completed: 'terminated', busy: 'no_answer', 'no-answer': 'no_answer', canceled: 'no_answer', failed: 'failed',
}

export async function POST(req: NextRequest) {
  const cfg = await getPlatformConfig()
  if (!verifySharedToken(new URL(req.url).searchParams.get('token'), cfg.voice.exotel_webhook_token)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  }
  const ct = req.headers.get('content-type') || ''
  const params: Record<string, string> = {}
  if (ct.includes('application/json')) {
    const j = (await req.json().catch(() => ({}))) as Record<string, unknown>
    for (const [k, v] of Object.entries(j)) if (typeof v === 'string' || typeof v === 'number') params[k] = String(v)
  } else {
    const form = await req.formData().catch(() => null)
    form?.forEach((v, k) => { if (typeof v === 'string') params[k] = v })
  }
  const sid = params.CallSid
  const status = (params.Status || params.CallStatus || '').toLowerCase()
  const event = MAP[status]
  const key = `exotel:${sid}:${status}`
  try {
    if (sid && event && (await claimEvent(key))) {
      const dur = Number(params.ConversationDuration || params.DialCallDuration || params.Duration)
      await handleCallStatus({ ref: sid, event, durationSec: Number.isFinite(dur) ? dur : null, eventId: key })
    }
  } catch (e) {
    console.error('[ats/screening/exotel] status failed', key, e)
    await releaseEvent(key)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 }) // Exotel retries
  }
  return NextResponse.json({ ok: true })
}
