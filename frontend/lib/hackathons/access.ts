/**
 * Server-side access + scoring helpers shared by the hackathon API routes.
 *
 * Staff = superadmin, or a tenant_admin of the event's own tenant (a missing
 * tenantId never matches — deny by default). The legacy 'admin' role is gone.
 */
import type { APIUser } from '@/lib/route-auth'
import { isTenantStaff } from '@/lib/exam-access'
import { getMongoDb } from '@/lib/mongodb'
import type { HackathonDoc } from '@/lib/db/qr-events'

type Who = Pick<APIUser, 'id' | 'role' | 'tenantId'> | null | undefined

export function isHackathonStaff(user: Who, hk: Pick<HackathonDoc, 'tenant_id'> | null | undefined): boolean {
  if (!user || !hk) return false
  return isTenantStaff(user, hk as unknown as Record<string, unknown>)
}

export function isHackathonJudge(user: Who, hk: Pick<HackathonDoc, 'judges'> | null | undefined): boolean {
  if (!user || !hk) return false
  return Array.isArray(hk.judges) && hk.judges.includes(user.id)
}

/** True once the event's end time has passed (unparseable end ⇒ false). */
export function hasEnded(hk: Pick<HackathonDoc, 'ends_at'>, now = Date.now()): boolean {
  const end = new Date(hk.ends_at).getTime()
  return Number.isFinite(end) && now > end
}

/**
 * AI screening totals per submission, scaled to 0–100 (screening stores
 * total out of maxTotal). Missing or broken audits are simply absent.
 */
export async function aiTotalsBySubmission(hackathonId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    const db = await getMongoDb()
    const audits = await db
      .collection('submission_audits')
      .find({ hackathonId }, { projection: { submissionId: 1, screening: 1 } })
      .toArray()
    for (const a of audits) {
      const sid = typeof a.submissionId === 'string' ? a.submissionId : ''
      const s = a.screening as { total?: unknown; maxTotal?: unknown } | undefined
      const total = typeof s?.total === 'number' && Number.isFinite(s.total) ? s.total : null
      const max = typeof s?.maxTotal === 'number' && Number.isFinite(s.maxTotal) && s.maxTotal > 0 ? s.maxTotal : null
      if (sid && total !== null && max !== null) out.set(sid, Math.max(0, Math.min(100, (total / max) * 100)))
    }
  } catch { /* screening is optional — final score falls back to human/auto */ }
  return out
}
