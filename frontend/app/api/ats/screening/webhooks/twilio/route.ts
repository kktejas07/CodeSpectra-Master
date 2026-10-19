/**
 * Twilio call status callback (optional — numbers are normally imported into
 * Vapi, which reports via /webhooks/vapi; this catches carrier-level outcomes).
 * Verifies X-Twilio-Signature over the public URL + sorted form params.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/ats/screening/config'
import { verifyTwilioSignature } from '@/lib/ats/screening/signatures'
import { appBaseUrl, handleCallStatus, type CallStatusEvent } from '@/lib/ats/screening/machine'
import { claimEvent, releaseEvent } from '@/lib/ats/screening/store'

export const runtime = 'nodejs'

const MAP: Record<string, CallStatusEvent['event']> = {
  ringing: 'ringing', 'in-progress': 'connected', answered: 'connected', completed: 'terminated',
  busy: 'no_answer', 'no-answer': 'no_answer', canceled: 'no_answer', failed: 'failed',
}

export async function POST(req: NextRequest) {
  const cfg = await getPlatformConfig()
  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const params: Record<string, string> = {}
  form.forEach((v, k) => { if (typeof v === 'string') params[k] = v })
  const u = new URL(req.url)
  const publicUrl = `${appBaseUrl()}${u.pathname}${u.search}`
  if (!verifyTwilioSignature(publicUrl, params, req.headers.get('x-twilio-signature'), cfg.voice.twilio_auth_token)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  const sid = params.CallSid
  const event = MAP[(params.CallStatus || '').toLowerCase()]
  const key = `twilio:${sid}:${params.CallStatus}`
  try {
    if (sid && event && (await claimEvent(key))) {
      await handleCallStatus({ ref: sid, event, durationSec: Number(params.CallDuration) || null, eventId: key })
    }
  } catch (e) {
    console.error('[ats/screening/twilio] status failed', key, e)
    await releaseEvent(key)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 }) // Twilio retries
  }
  return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
}
