/**
 * POST /api/ats/screening/start { application_id } — manual (re)start of the
 * bot screen for an application sitting in a bot_screen stage. Cancels any
 * active call of the current entry and starts again from the first channel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auditAts, can, parseId, requireAts, tenantFromRequest } from '@/lib/ats/access'
import { limitRequest } from '@/lib/rate-limit'
import { restartBotScreen } from '@/lib/ats/screening/machine'
import { loadVisibleApp, publicCall } from '@/lib/ats/screening/route-helpers'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const gate = await requireAts(['admin', 'recruiter', 'hiring_manager'], tenantFromRequest(req))
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { actor } = gate
  if (!can(actor, 'application.move') && !can(actor, 'application.approve')) {
    return NextResponse.json({ error: "Your hiring role can't start screenings" }, { status: 403 })
  }
  const limited = await limitRequest(req, 'ats-screening-start', actor.userId, 20, 60_000)
  if (limited) return limited
  const body = (await req.json().catch(() => ({}))) as { application_id?: unknown }
  const appId = parseId(body.application_id)
  if (!appId) return NextResponse.json({ error: 'application_id is required' }, { status: 400 })
  try {
    const hit = await loadVisibleApp(actor, appId)
    if (!hit) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    const stage = hit.job.pipeline.find((s) => s.id === hit.app.stage_id)
    if (!stage || stage.type !== 'bot_screen' || hit.app.status !== 'active') {
      return NextResponse.json({ error: 'The application is not in an active bot screening stage' }, { status: 409 })
    }
    const call = await restartBotScreen(hit.app, hit.job, hit.candidate)
    await auditAts(actor, 'ats.screening.start', 'application', appId, call ? `channel ${call.channel}` : 'no channel', req)
    if (!call) return NextResponse.json({ ok: false, error: 'No usable channel — check the phone number and consent' }, { status: 422 })
    return NextResponse.json({ ok: true, call: publicCall(call) })
  } catch (e) {
    console.error('[ats/screening/start] failed:', e)
    return NextResponse.json({ error: 'Could not start the screening' }, { status: 500 })
  }
}
