import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { CATALOG, REGIONS } from '@/lib/ats/bgv/catalog'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/bgv/http'
import { getBgvSettings, getVendorSecrets, publicSettings, saveBgvSettings, vendorSettingsError } from '@/lib/ats/bgv/settings'
import { IDFY_DEFAULT_TASKS, IDFY_TASK_KEYS, IDFY_WEBHOOK_IPS } from '@/lib/ats/bgv/vendors/idfy'
import { AUTHBRIDGE_CHECKS } from '@/lib/ats/bgv/vendors/authbridge'
import { simulatedVendorAllowed, vendorsFor } from '@/lib/ats/bgv/vendors'
import { getAppOrigin } from '@/lib/app-origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET → BGV settings (vendor keys as "is set" flags). Admins and recruiters can read. */
export async function GET(req: NextRequest) {
  const g = await gate(req, 'clients.view', ['admin', 'recruiter'])
  if ('res' in g) return g.res
  try {
    const s = await getBgvSettings(g.actor.tenantId)
    const origin = getAppOrigin()
    const t = encodeURIComponent(g.actor.tenantId)
    // The IDfy callback URL carries the shared token: shown to hiring admins only.
    const idfyToken = g.actor.role === 'admin' ? (await getVendorSecrets(g.actor.tenantId)).idfy_webhook_token : null
    return json({
      settings: await publicSettings(s),
      can_manage: g.actor.role === 'admin',
      checks: Object.fromEntries(REGIONS.map((r) => [r, CATALOG[r].map((c) => ({ type: c.type, label: c.label, candidate_input: c.candidate_input }))])),
      vendors: await (async () => { const allowSimulated = await simulatedVendorAllowed(); return Object.fromEntries(REGIONS.map((r) => [r, vendorsFor(r, { allowSimulated })])) })(),
      checkr_webhook_url: `${origin}/api/ats/bgv/webhooks/checkr?tenant=${t}`,
      idfy_webhook_url: idfyToken ? `${origin}/api/ats/bgv/webhooks/idfy?tenant=${t}&token=${encodeURIComponent(idfyToken)}` : null,
      authbridge_webhook_url: `${origin}/api/ats/bgv/webhooks/authbridge?tenant=${t}`,
      idfy_meta: { task_keys: IDFY_TASK_KEYS, default_tasks: IDFY_DEFAULT_TASKS, webhook_ips: IDFY_WEBHOOK_IPS },
      authbridge_checks: AUTHBRIDGE_CHECKS,
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
    const bad = vendorSettingsError(b)
    if (bad) return json({ error: bad }, 400)
    const s = await saveBgvSettings(g.actor.tenantId, b, g.actor.userId)
    await auditAts(g.actor, 'ats.bgv.settings', 'ats_bgv_settings', g.actor.tenantId, Object.keys(b).join(','), req)
    return json({ settings: await publicSettings(s) })
  } catch (e) {
    return errorResponse(e, 'bgv settings save')
  }
}
