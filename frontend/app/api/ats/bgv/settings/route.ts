import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { CATALOG, REGIONS } from '@/lib/ats/bgv/catalog'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/bgv/http'
import { getBgvSettings, publicSettings, saveBgvSettings } from '@/lib/ats/bgv/settings'
import { vendorsFor } from '@/lib/ats/bgv/vendors'
import { getAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET → BGV settings (vendor keys as "is set" flags). Admins and recruiters can read. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'clients.view', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  try {
    const s = await getBgvSettings(g.actor.tenantId)
    return json({
      settings: await publicSettings(s),
      can_manage: g.actor.role === 'admin',
      checks: Object.fromEntries(REGIONS.map((r) => [r, CATALOG[r].map((c) => ({ type: c.type, label: c.label, candidate_input: c.candidate_input }))])),
      vendors: Object.fromEntries(REGIONS.map((r) => [r, vendorsFor(r)])),
      checkr_webhook_url: `${getAppOrigin()}/api/ats/bgv/webhooks/checkr?tenant=${encodeURIComponent(g.actor.tenantId)}`,
    })
  } catch (e) {
    return errorResponse(e, 'bgv settings get')
  }
}

/** PATCH → admins only. */
export async function PATCH(req: NextRequest) {
  const g = await gate(req, 'settings.manage', ['admin'])
  if ('res' in g) return g.res
  try {
    const b = await bodyOf(req)
    const s = await saveBgvSettings(g.actor.tenantId, b, g.actor.userId)
    await auditAts(g.actor, 'ats.bgv.settings', 'ats_bgv_settings', g.actor.tenantId, Object.keys(b).join(','), req)
    return json({ settings: await publicSettings(s) })
  } catch (e) {
    return errorResponse(e, 'bgv settings save')
  }
}
