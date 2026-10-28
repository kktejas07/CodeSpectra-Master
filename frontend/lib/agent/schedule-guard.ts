/**
 * W4-08: scheduled copilot reports run with tenant scope and mail data to the
 * admin who created them. Before every run the creator is re-authorised (still
 * an active account, still superadmin / admin of that tenant). If not, the
 * workflow is switched off, and the tenant's admins (or the platform admins
 * for a platform workflow) are told. The delivery step is re-pointed at the
 * creator's current e-mail / id, so a changed address never gets stale data.
 */
import 'server-only'
import { COPILOT_SCHEDULE_TEMPLATE, creatorStillAuthorised, retargetDelivery, type CreatorCheck } from './schedule'

type Wf = { id: string; name?: string; tenant_id?: string | null; created_by?: string | null; template_id?: string | null; steps?: Array<{ id?: string; type: string; config?: Record<string, unknown> }> }

export function isCopilotSchedule(wf: { template_id?: string | null }): boolean {
  return wf.template_id === COPILOT_SCHEDULE_TEMPLATE
}

export async function checkScheduleCreator(wf: Wf): Promise<CreatorCheck & { userId?: string }> {
  const uid = String(wf.created_by || '')
  if (!uid) return { ok: false, reason: 'creator_missing' }
  const { loadAuthProfile, isTenantActive } = await import('@/lib/session')
  const { resolveAccount, profileTenantId } = await import('@/lib/auth-account')
  const profile = await loadAuthProfile(uid)
  const tenantActive = profile ? await isTenantActive(profileTenantId(profile)).catch(() => false) : null
  const resolved = resolveAccount(profile, { tenantActive })
  const out = creatorStillAuthorised(resolved, wf.tenant_id ?? null, profile?.email)
  return out.ok ? { ...out, userId: String(profile?.id || uid) } : out
}

/**
 * Returns the workflow to run (delivery re-targeted), or null after switching
 * it off because the creator may no longer receive it.
 */
export async function authoriseCopilotScheduleRun<T extends Wf>(wf: T): Promise<T | null> {
  if (!isCopilotSchedule(wf)) return wf
  const check = await checkScheduleCreator(wf)
  if (check.ok) {
    if (!check.email && wf.steps?.some((s) => s.id === 'deliver' && s.type === 'email.send')) return disable(wf, 'creator_missing')
    return { ...wf, steps: retargetDelivery(wf.steps || [], { userId: check.userId || String(wf.created_by), email: check.email }) }
  }
  return disable(wf, check.reason)
}

async function disable<T extends Wf>(wf: T, reason: string): Promise<null> {
  const { col } = await import('@/lib/automation/store')
  const now = new Date().toISOString()
  const res = await (await col('workflows')).updateOne(
    { id: wf.id, is_active: true },
    { $set: { is_active: false, disabled_reason: reason, disabled_at: now, updated_at: now } },
  )
  if (res.modifiedCount !== 1) return null // already switched off (another replica / earlier run)
  console.warn(`[agent/schedule] disabled scheduled copilot task ${wf.id}: ${reason}`)
  const title = 'A scheduled AI report was switched off'
  const message = `“${String(wf.name || 'Scheduled report').slice(0, 120)}” was created by an admin who no longer has admin access, so it will not run again. Recreate it from the AI copilot if it is still needed.`
  try {
    const { getMongoDb } = await import('@/lib/mongodb')
    const db = await getMongoDb()
    const filter = wf.tenant_id
      ? { role: 'tenant_admin', $or: [{ tenantId: wf.tenant_id }, { organizationId: wf.tenant_id }], deletedAt: null }
      : { role: 'superadmin' }
    const admins = await db.collection('user').find(filter as never, { projection: { _id: 0, id: 1 } }).limit(50).toArray()
    const ids = admins.map((a) => String(a.id || '')).filter((x) => x && x !== String(wf.created_by || ''))
    if (ids.length) {
      const { notifyMany } = await import('@/lib/notifications')
      await notifyMany(ids, { type: 'system.alert', title, message, link: `/dashboard/admin/workflows?workflow=${wf.id}`, icon: 'alert-triangle' } as never)
    }
  } catch (e) {
    console.error('[agent/schedule] notify admins failed:', (e as Error)?.message)
  }
  return null
}

/** Offboarding hook: switch off every scheduled copilot task a user created. */
export async function disableSchedulesCreatedBy(userId: string, reason = 'creator_offboarded'): Promise<number> {
  if (!userId) return 0
  const { col } = await import('@/lib/automation/store')
  const now = new Date().toISOString()
  const r = await (await col('workflows')).updateMany(
    { created_by: userId, template_id: COPILOT_SCHEDULE_TEMPLATE, is_active: true },
    { $set: { is_active: false, disabled_reason: reason, disabled_at: now, updated_at: now } },
  )
  return r.modifiedCount || 0
}
