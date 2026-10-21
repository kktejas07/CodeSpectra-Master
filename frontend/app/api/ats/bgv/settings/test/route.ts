import { NextRequest } from 'next/server'
import { auditAts } from '@/lib/ats/access'
import { bodyOf, errorResponse, gate, json } from '@/lib/ats/bgv/http'
import { getBgvSettings, getVendorSecrets } from '@/lib/ats/bgv/settings'
import { VENDORS } from '@/lib/ats/bgv/vendors'
import { limitRequest } from '@/lib/rate-limit'
import { AtsError } from '@/lib/ats/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST { vendor } → admins only: check the saved vendor credentials without ordering anything. */
export async function POST(req: NextRequest) {
  const g = await gate(req, 'settings.manage', ['admin'])
  if ('res' in g) return g.res
  try {
    const b = await bodyOf(req)
    const v = typeof b.vendor === 'string' ? VENDORS[b.vendor] : undefined
    if (!v?.testConnection) throw new AtsError(400, 'Pick a vendor to test')
    const rl = await limitRequest(req, 'ats-bgv-vendor-test', g.actor.tenantId, 10, 10 * 60_000)
    if (rl) return rl
    const [settings, secrets] = await Promise.all([getBgvSettings(g.actor.tenantId), getVendorSecrets(g.actor.tenantId)])
    const result = await v.testConnection(settings, secrets)
    await auditAts(g.actor, 'ats.bgv.vendor_test', 'ats_bgv_settings', g.actor.tenantId, `${v.id}:${result.ok ? 'ok' : 'fail'}`, req)
    return json(result)
  } catch (e) {
    return errorResponse(e, 'bgv vendor test')
  }
}
