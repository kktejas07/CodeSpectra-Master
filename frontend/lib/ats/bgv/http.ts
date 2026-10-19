/**
 * Route helpers for /api/ats/bgv/**: load a case the actor may see (via the
 * application's access rules), verifier / admin gates, client IP.
 */
import 'server-only'
import type { AtsActor } from '@/lib/ats/contract'
import { AtsError } from '@/lib/ats/engine'
import { gate, loadApplication } from '@/lib/ats/http'
import { canRevealBgv, canVerifyBgv } from './access'
import { getCase } from './service'
import type { BgvCaseDoc } from './types'

export { errorResponse, json, bodyOf, NO_STORE } from '@/lib/ats/http'
export { gate }

export type CaseMode = 'view' | 'verify' | 'admin'

/** The case if the actor may see its application; verify = admin/recruiter, admin = admin. 404 hides existence. */
export async function loadCase(actor: AtsActor, caseId: string, mode: CaseMode = 'view'): Promise<BgvCaseDoc> {
  if (actor.role === 'interviewer') throw new AtsError(404, 'Background check not found')
  const c = await getCase(actor.tenantId, caseId)
  if (!c) throw new AtsError(404, 'Background check not found')
  await loadApplication(actor, c.application_id) // throws 404 when the actor can't see the application
  if (actor.role === 'client' && !c.client_visible) throw new AtsError(404, 'Background check not found')
  if (mode === 'verify' && !canVerifyBgv(actor.role)) throw new AtsError(403, 'Only recruiters and hiring admins can verify background checks')
  if (mode === 'admin' && !canRevealBgv(actor.role)) throw new AtsError(403, 'Only hiring admins can do this')
  return c
}

export function clientIp(req: Request): string {
  const h = req.headers
  return (h.get('cf-connecting-ip') || h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64)
}
