import { NextRequest } from 'next/server'
import { loadApplication } from '@/lib/ats/http'
import { auditAts } from '@/lib/ats/access'
import { bgvViewFor, canRevealBgv, canVerifyBgv } from '@/lib/ats/bgv/access'
import { fairChanceHint, REGIONS } from '@/lib/ats/bgv/catalog'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/bgv/http'
import { latestCaseForApplication, startCaseManually } from '@/lib/ats/bgv/service'
import { simulatedVendorAllowed, vendorsFor } from '@/lib/ats/bgv/vendors'
import type { BgvRegion } from '@/lib/ats/contract'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET ?application_id= → the latest BGV case of the application, as the actor may see it. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'application.view')
  if ('res' in g) return g.res
  const { actor } = g
  try {
    if (actor.role === 'interviewer') return json({ error: 'Not found' }, 404)
    const { app, job } = await loadApplication(actor, new URL(req.url).searchParams.get('application_id') || '')
    const c = await latestCaseForApplication(actor.tenantId, app.id)
    const view = c ? bgvViewFor(actor.role, c) : null
    if (actor.role === 'client') return json({ case: view })
    const stage = job.pipeline.find((s) => s.id === app.stage_id)
    const types = job.pipeline.map((s) => s.type as string)
    const bgvIdx = types.indexOf('bgv')
    if (view?.view === 'full') await auditAts(actor, 'ats.bgv.view', 'ats_bgv_case', c!.id, `application ${app.id}`, req)
    return json({
      case: view,
      in_bgv_stage: (stage?.type as string) === 'bgv',
      can: { verify: canVerifyBgv(actor.role), reveal: canRevealBgv(actor.role) },
      vendors: c ? vendorsFor(c.region, { allowSimulated: await simulatedVendorAllowed() }) : [],
      fair_chance_hint: c ? fairChanceHint(c.region, types, bgvIdx) : null,
    })
  } catch (e) {
    return errorResponse(e, 'bgv get')
  }
}

/** POST { application_id, region? } → start (or restart a cancelled) BGV case for an application in a bgv stage. */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'application.move', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  const limited = await limitRequest(req, 'ats-bgv-start', g.actor.userId, 20, 60_000)
  if (limited) return limited
  try {
    const b = await bodyOf(req)
    const { app, job } = await loadApplication(g.actor, String(b.application_id || ''))
    const region = (REGIONS as string[]).includes(String(b.region)) ? (b.region as BgvRegion) : null
    const c = await startCaseManually(g.actor, app, job, region)
    await auditAts(g.actor, 'ats.bgv.start', 'ats_bgv_case', c.id, `application ${app.id} region ${c.region}`, req)
    return json({ case: bgvViewFor(g.actor.role, c) }, 201)
  } catch (e) {
    return errorResponse(e, 'bgv start')
  }
}
