/**
 * Per-tenant automation quotas. Platform (superadmin) workflows are not
 * limited. Counters live in automation_quota, one row per tenant/day/kind.
 */
import { col, nowIso } from './store'

export type QuotaKind = 'runs' | 'emails' | 'whatsapp' | 'webhooks' | 'ai'

export const TENANT_LIMITS: Record<QuotaKind, number> = {
  runs: 2000,
  // Organisation workflows send from the platform's domain (AUTO-012): kept modest.
  emails: 500,
  whatsapp: 200,
  webhooks: 2000,
  ai: 200,
}

/** Most workflows one organisation can keep. */
export const MAX_TENANT_WORKFLOWS = 50

export function quotaKey(tenantId: string, kind: QuotaKind, now: Date): string {
  return `${tenantId}:${now.toISOString().slice(0, 10)}:${kind}`
}

export function overLimit(count: number, kind: QuotaKind, limits: Record<QuotaKind, number> = TENANT_LIMITS): boolean {
  return count > limits[kind]
}

export class QuotaExceededError extends Error {
  permanent = true
  constructor(public kind: QuotaKind) {
    super(`Daily ${kind} limit reached for your organisation (${TENANT_LIMITS[kind]}). It resets at 00:00 UTC.`)
  }
}

/**
 * Count one use. Throws QuotaExceededError when the tenant is over its
 * daily limit (the use is still counted, so the row shows real demand).
 */
export async function consumeQuota(tenantId: string | null | undefined, kind: QuotaKind, now = new Date(), amount = 1): Promise<void> {
  if (!tenantId) return
  const c = await col('automation_quota')
  const key = quotaKey(tenantId, kind, now)
  const row = await c.findOneAndUpdate(
    { key },
    { $inc: { count: amount }, $setOnInsert: { key, tenant_id: tenantId, kind, day: now.toISOString().slice(0, 10), created_at: nowIso() } },
    { upsert: true, returnDocument: 'after' },
  )
  if (overLimit(Number(row?.count || 0), kind)) throw new QuotaExceededError(kind)
}

/**
 * Count a step's side effect once, however often the step is retried
 * (AUTO-015). `ref` = `${runId}:${stepKey}`.
 */
export async function consumeQuotaOnce(tenantId: string | null | undefined, kind: QuotaKind, ref: string, now = new Date()): Promise<void> {
  if (!tenantId) return
  const { claimOnce } = await import('./store')
  if (!(await claimOnce(`quota:${kind}:${ref}`))) return
  await consumeQuota(tenantId, kind, now)
}

export async function quotaUsage(tenantId: string, now = new Date()): Promise<Record<QuotaKind, { used: number; limit: number }>> {
  const c = await col('automation_quota')
  const day = now.toISOString().slice(0, 10)
  const rows = await c.find({ tenant_id: tenantId, day }).toArray()
  const out = {} as Record<QuotaKind, { used: number; limit: number }>
  for (const k of Object.keys(TENANT_LIMITS) as QuotaKind[]) out[k] = { used: 0, limit: TENANT_LIMITS[k] }
  for (const r of rows) if (r.kind in out) out[r.kind as QuotaKind].used = Number(r.count || 0)
  return out
}
