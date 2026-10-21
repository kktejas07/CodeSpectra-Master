/**
 * Voice-agent server messages (Vapi; the generic SIP agent posts the same shape).
 * Auth: `x-vapi-secret` (set on every assistant we create) or Bearer, compared
 * timing-safe with the configured webhook secret. Handled: status-update,
 * end-of-call-report (transcript, recording, analysis.structuredData). Idempotent
 * per (call, message type, status).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getPlatformConfig } from '@/lib/ats/screening/config'
import { verifyVapiSecret } from '@/lib/ats/screening/signatures'
import { parseVapiReport } from '@/lib/ats/screening/providers/voice'
import { handleVoiceReport } from '@/lib/ats/screening/machine'
import { claimEvent, releaseEvent } from '@/lib/ats/screening/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const cfg = await getPlatformConfig()
  const ok =
    verifyVapiSecret(req.headers, cfg.voice.vapi_webhook_secret) ||
    (!!cfg.voice.voice_agent_webhook_secret && verifyVapiSecret({ get: (n) => (n === 'x-vapi-secret' ? req.headers.get('x-voice-agent-secret') : req.headers.get(n)) }, cfg.voice.voice_agent_webhook_secret))
  if (!ok) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  const raw = await req.text()
  if (raw.length > 5_000_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 }) }

  const report = parseVapiReport(body)
  if (report.kind === 'other' || (!report.ref && !report.screeningCallId)) return NextResponse.json({ ok: true })
  const key = `voice:${report.ref || report.screeningCallId}:${report.kind}:${report.status || ''}`
  try {
    if (await claimEvent(key)) await handleVoiceReport(report)
  } catch (e) {
    console.error('[ats/screening/vapi] report failed', key, e)
    await releaseEvent(key)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 }) // provider retries
  }
  return NextResponse.json({ ok: true })
}
