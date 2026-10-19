/**
 * POST /api/ats/screening/test { phone, channel } — "Test with my number".
 * Runs the real flow (template → questions / permission → call) against the
 * admin's own phone with three sample questions. Never touches a pipeline.
 * Unconfigured channels run on the simulated provider (nothing is sent; drive
 * it from the transcript panel).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auditAts, can, requireAts, tenantFromRequest } from '@/lib/ats/access'
import type { BotChannel } from '@/lib/ats/contract'
import { limitRequest } from '@/lib/rate-limit'
import { startTestScreen } from '@/lib/ats/screening/machine'
import { publicCall } from '@/lib/ats/screening/route-helpers'

export const runtime = 'nodejs'
const CHANNELS: BotChannel[] = ['whatsapp_chat', 'whatsapp_call', 'phone_call']

export async function POST(req: NextRequest) {
  const g = await requireAts(['admin'], tenantFromRequest(req))
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status })
  if (!can(g.actor, 'settings.manage')) return NextResponse.json({ error: 'Only hiring admins can run tests' }, { status: 403 })
  const limited = await limitRequest(req, 'ats-screening-test', g.actor.userId, 5, 10 * 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as { phone?: unknown; channel?: unknown; language?: unknown }
  const channel = CHANNELS.find((c) => c === body.channel)
  const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 32) : ''
  const language = typeof body.language === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(body.language) ? body.language : 'en-IN'
  if (!channel) return NextResponse.json({ error: 'Pick a channel' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Enter your phone number' }, { status: 400 })
  try {
    const call = await startTestScreen({ tenantId: g.actor.tenantId, userId: g.actor.userId, phone, name: g.actor.name || 'there', channel, language })
    if (!call) return NextResponse.json({ error: 'That phone number does not look valid — use international format, e.g. +91 98765 43210' }, { status: 400 })
    await auditAts(g.actor, 'ats.screening.test', 'screening_call', call.id, channel, req)
    return NextResponse.json({ ok: true, call: publicCall(call) })
  } catch (e) {
    console.error('[ats/screening/test] failed:', e)
    return NextResponse.json({ error: 'Could not start the test' }, { status: 500 })
  }
}
