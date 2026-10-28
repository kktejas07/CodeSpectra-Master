/**
 * Revoke one issued certificate. Extracted from
 * POST /api/admin/certifications/[id]/revoke — the route and the admin agent
 * call revokeCertificate, so scope rules and the audit log are identical.
 */
import 'server-only'
import { ObjectId } from 'mongodb'
import { getMongoDb } from '@/lib/mongodb'
import { certificationAttempts } from '@/lib/db/certifications'
import { canRevokeExamCertificate } from '@/lib/exam-access'
import { writeAuditLog, auditLogAction } from '@/lib/db/misc'
import { ok, fail, type ServiceResult, type ServiceUser } from './result'

export const CERT_ID_RE = /^[A-Za-z0-9_-]{1,100}$/
export const MIN_REVOKE_REASON = 5
export const MAX_REVOKE_REASON = 500

/** Validation shared by the route and the agent tool; null when fine. */
export function revokeInputProblem(id: unknown, reason: unknown): string | null {
  if (typeof id !== 'string' || !CERT_ID_RE.test(id)) return 'Invalid certificate id'
  const r = typeof reason === 'string' ? reason.trim() : ''
  if (r.length < MIN_REVOKE_REASON) return `Give a reason (at least ${MIN_REVOKE_REASON} characters).`
  if (r.length > MAX_REVOKE_REASON) return `Keep the reason under ${MAX_REVOKE_REASON} characters.`
  return null
}

function idMatchOf(id: string): Record<string, unknown>[] {
  // Older rows may only have a Mongo _id (the issued list falls back to it).
  const idMatch: Record<string, unknown>[] = [{ id }]
  if (ObjectId.isValid(id) && id.length === 24) idMatch.push({ _id: new ObjectId(id) })
  return idMatch
}

/** The certificate if this user may revoke it (out-of-scope = null, like missing). Reads only. */
export async function findRevocableCertificate(user: ServiceUser, id: string): Promise<Record<string, unknown> | null> {
  const col = await certificationAttempts()
  const cert = await col.findOne(
    { $or: idMatchOf(id) } as Record<string, unknown>,
    { projection: { _id: 0, id: 1, certification_id: 1, revoked_at: 1, passed: 1, user_id: 1, title: 1, certification_title: 1, issued_at: 1 } },
  )
  // Tenant scope: the certificate's exam must belong to the admin's tenant.
  let exam: Record<string, unknown> | null = null
  if (cert && user.role !== 'superadmin' && typeof cert.certification_id === 'string') {
    const db = await getMongoDb()
    exam = (await db.collection('exams').findOne(
      { id: cert.certification_id },
      { projection: { _id: 0, id: 1, tenant_id: 1 } },
    )) as Record<string, unknown> | null
  }
  if (!cert || !canRevokeExamCertificate(user, cert as unknown as Record<string, unknown>, exam)) return null
  return cert as unknown as Record<string, unknown>
}

export async function revokeCertificate(
  user: ServiceUser,
  id: string,
  reasonIn: string,
  actorIp: string,
): Promise<ServiceResult<{ ok: true; id: string; revokedAt: string }>> {
  if (user.role !== 'superadmin' && user.role !== 'tenant_admin') return fail(403, 'Forbidden')
  const problem = revokeInputProblem(id, reasonIn)
  if (problem) return fail(400, problem)
  const reason = reasonIn.trim()

  const col = await certificationAttempts()
  const cert = await findRevocableCertificate(user, id)
  if (!cert) return fail(404, 'Certificate not found')
  if (cert.revoked_at) return fail(409, 'This certificate is already revoked.')

  const now = new Date().toISOString()
  const updated = await col.findOneAndUpdate(
    { $or: idMatchOf(id), passed: true, revoked_at: null } as Record<string, unknown>,
    { $set: { revoked_at: now, revoked_by: user.id, revoke_reason: reason } },
    { returnDocument: 'after', projection: { _id: 0, id: 1, revoked_at: 1 } },
  )
  if (!updated) return fail(409, 'This certificate is already revoked.')

  await writeAuditLog({
    ...auditLogAction('certificate.revoke', 'success', user.id, actorIp, id, 'certificate', 'warning', reason),
    tenant_id: user.role === 'tenant_admin' ? user.tenantId ?? null : null,
  })

  return ok({ ok: true as const, id, revokedAt: String(updated.revoked_at) })
}
