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
import { handleWhatsAppInbound } from '@/lib/subscriptions'
import { applyWhatsAppKeyword } from '@/lib/whatsapp-send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams
  const cfg = await getPlatformConfig()
  if (p.get('hub.mode') === 'subscribe' && verifySharedToken(p.get('hub.verify_token'), cfg.whatsapp.verify_token)) {
    return new NextResponse(p.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ error: 'Forbidden', code: 'forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (raw.length > 1_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const cfg = await getPlatformConfig()
  if (!verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), cfg.whatsapp.app_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }

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
    for (const m of messages) {
      let screening: unknown
      await run(`wa:msg:${m.id}`, async () => { screening = await handleInbound(m) })
      // Opt-in subscriptions (lib/subscriptions): STOP / START keywords and the 24 h session
      // window, claimed as their OWN event: a failure (e.g. the STOP write) answers 500 so Meta
      // redelivers and the opt-out is retried — without re-running the screening reply. On a
      // redelivery the screening result is unknown, so no keyword reply is sent (the opt-out
      // itself is still applied).
      await run(`wa:subs:${m.id}`, () => handleWhatsAppInbound({ from: m.from, text: m.text || m.replyTitle || null, at: m.at }, { replied: screening === undefined || screening === 'handled' }))
      // STOP / START for every WhatsApp message we send (preferences, candidates, sellers, the
      // phone-level opt-out list — AUTO-061). Its own claimed event, so a failed write is redelivered.
      await run(`wa:optout:${m.id}`, () => applyWhatsAppKeyword({ from: m.from, text: m.text || m.replyTitle || null, at: m.at }))
      // WhatsApp practice (lib/wa-practice): opt-in replies, answers, commands. Runs after the
      // opt-out handler (STOP is already recorded) and never for a reply the screening bot took.
      await run(`wa:practice:${m.id}`, async () => {
        const { handlePracticeInbound } = await import('@/lib/wa-practice/service')
        await handlePracticeInbound({ id: m.id, from: m.from, text: m.text ?? null, replyId: m.replyId ?? null, at: m.at }, { skip: screening === 'handled' })
      })
    }
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
