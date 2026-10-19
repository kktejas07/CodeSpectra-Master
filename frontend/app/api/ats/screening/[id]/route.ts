/**
 * GET  /api/ats/screening/[id] — one screening call: transcript, answers, score, recording.
 * POST /api/ats/screening/[id] — drive a *simulated* call (no provider configured):
 *      { event: 'reply', text } | { event: 'permission', accept } |
 *      { event: 'call_report', transcript: [{ role, text }], answers? } | { event: 'no_answer' }
 */
import { NextRequest, NextResponse } from 'next/server'
import { can, parseId, requireAts, tenantFromRequest } from '@/lib/ats/access'
import type { AtsActor } from '@/lib/ats/contract'
import { limitRequest } from '@/lib/rate-limit'
import { callsCol } from '@/lib/ats/screening/store'
import { handleCallStatus, handleInbound, handleVoiceReport } from '@/lib/ats/screening/machine'
import { loadVisibleApp, publicCall, SCREENING_VIEW_ROLES } from '@/lib/ats/screening/route-helpers'
import type { ScreeningCallDoc } from '@/lib/ats/screening/types'

export const runtime = 'nodejs'
type Ctx = { params: Promise<{ id: string }> }

async function loadCall(actor: AtsActor, id: string): Promise<ScreeningCallDoc | null> {
  const call = (await (await callsCol()).findOne({ id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as ScreeningCallDoc | null
  if (!call) return null
  if (call.is_test) return actor.role === 'admin' ? call : null
  return (await loadVisibleApp(actor, call.application_id)) ? call : null
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireAts([...SCREENING_VIEW_ROLES], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  try {
    const call = await loadCall(gate.actor, id)
    if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ call: publicCall(call) })
  } catch (e) {
    console.error('[ats/screening/get] failed:', e)
    return NextResponse.json({ error: 'Could not load the screening' }, { status: 500 })
  }
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')

export async function POST(req: NextRequest, { params }: Ctx) {
  const id = parseId((await params).id)
  if (!id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const gate = await requireAts(['admin', 'recruiter'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  if (!can(actor, 'application.move') && actor.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const limited = await limitRequest(req, 'ats-screening-sim', actor.userId, 60, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const call = await loadCall(actor, id)
    if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (call.provider !== 'simulated') return NextResponse.json({ error: 'Only simulated screenings can be driven by hand' }, { status: 409 })
    const msgId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    let result: string
    switch (body.event) {
      case 'reply': {
        const text = str(body.text, 2000)
        const replyId = str(body.reply_id, 120)
        if (!text && !replyId) return NextResponse.json({ error: 'text is required' }, { status: 400 })
        result = await handleInbound({ id: msgId, from: call.to, type: replyId ? 'interactive' : 'text', text, replyId: replyId ? `${call.id}|${replyId}` : null })
        break
      }
      case 'permission':
        // replyId pins the simulated reply to this call (real permission replies are matched by number)
        result = await handleInbound({ id: msgId, from: call.to, type: 'interactive', replyId: `${call.id}|permission`, permission: { response: body.accept === false ? 'reject' : 'accept' } })
        break
      case 'no_answer':
        if (!call.provider_ref) return NextResponse.json({ error: 'No call has been placed yet' }, { status: 409 })
        result = await handleCallStatus({ ref: call.provider_ref, event: 'no_answer', eventId: msgId })
        break
      case 'call_report': {
        if (!call.provider_ref) return NextResponse.json({ error: 'No call has been placed yet' }, { status: 409 })
        const lines = Array.isArray(body.transcript) ? (body.transcript as { role?: unknown; text?: unknown }[]).slice(0, 200) : []
        const transcript = lines
          .map((l) => ({ role: (l.role === 'candidate' ? 'candidate' : 'bot') as 'bot' | 'candidate', text: str(l.text, 2000), at: new Date().toISOString() }))
          .filter((l) => l.text)
        const structured = body.answers && typeof body.answers === 'object' ? (body.answers as Record<string, unknown>) : {}
        result = await handleVoiceReport({
          kind: 'end', ref: call.provider_ref, screeningCallId: call.id, transcript, structured, summary: null,
          recordingUrl: null, durationSec: transcript.length * 10, carrierRef: null, endedReason: transcript.length ? 'customer-ended-call' : 'customer-did-not-answer',
        })
        break
      }
      default:
        return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
    }
    const fresh = (await (await callsCol()).findOne({ id, tenant_id: actor.tenantId }, { projection: { _id: 0 } })) as ScreeningCallDoc | null
    return NextResponse.json({ ok: result === 'handled', call: fresh ? publicCall(fresh) : null })
  } catch (e) {
    console.error('[ats/screening/simulate] failed:', e)
    return NextResponse.json({ error: 'Could not update the screening' }, { status: 500 })
  }
}
