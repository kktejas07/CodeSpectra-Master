/**
 * Meta WhatsApp Cloud API webhook (fields: messages, calls).
 *  GET  hub.mode=subscribe&hub.verify_token=…&hub.challenge=… → echo challenge
 *  POST X-Hub-Signature-256 verified against the app secret over the raw body;
 *       each message / call event is processed once (ats_screening_events).
 * 200 once every event is processed; a failed event is released and answered
 * 500 so Meta redelivers it (processed events stay claimed).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/ats/screening/config'
import { verifyMetaSignature, verifySharedToken } from '@/lib/ats/screening/signatures'
import { parseMetaWebhook } from '@/lib/ats/screening/webhook-parse'
import { handleCallStatus, handleInbound, tickScreening } from '@/lib/ats/screening/machine'
import { claimEvent, releaseEvent } from '@/lib/ats/screening/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const cfg = await getPlatformConfig()
  if (p.get('hub.mode') === 'subscribe' && verifySharedToken(p.get('hub.verify_token'), cfg.whatsapp.verify_token)) {
    return new NextResponse(p.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const cfg = await getPlatformConfig()
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), cfg.whatsapp.app_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { messages, calls } = parseMetaWebhook(body)
  // A failed event is released and the whole delivery answered 500 so Meta retries it;
  // events that did succeed stay claimed and are skipped on the retry.
  let failed = false
  const run = async (key: string, fn: () => Promise<unknown>) => {
    if (!(await claimEvent(key))) return
    try {
      await fn()
    } catch (e) {
      failed = true
      console.error('[ats/screening/whatsapp] event failed', key, e)
      await releaseEvent(key)
    }
  }
  try {
    for (const m of messages) await run(`wa:msg:${m.id}`, () => handleInbound(m))
    for (const c of calls) await run(`wa:${c.eventId}`, () => handleCallStatus(c))
  } catch (e) {
    console.error('[ats/screening/whatsapp] claim failed', e)
    failed = true
  }
  if (failed) return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  // opportunistic: keep reminders/timeouts moving even without an external cron
  tickScreening(new Date(), 10).catch(() => undefined)
  return NextResponse.json({ ok: true })
}
